/**
 * Realtime Poller — Poll EE88 members API mỗi 5-10s
 *
 * Flow:
 *   1. Lấy danh sách agents đang active
 *   2. Với mỗi agent: gọi EE88 members API (page 1, limit 2000)
 *   3. So sánh với snapshot trước đó (Redis)
 *   4. Phát hiện: khách mới (new) + khách mất (lost)
 *   5. Lưu events vào SQLite (customer_events)
 *   6. Emit qua EventEmitter → WebSocket push
 *
 * Redis keys:
 *   poll:members:{agentId} — JSON Map<uid, memberObj>
 *   poll:status             — JSON { running, lastPoll, agentResults }
 */

const { EventEmitter } = require('events');
const { getDb } = require('../database/init');
const { fetchEndpointForAgent } = require('./ee88Client');
const { autoRelogin } = require('./loginService');
const {
  saveMemberSnapshot,
  getMemberSnapshot,
  isConnected: redisOk
} = require('./redisClient');
const { createLogger } = require('../utils/logger');

const log = createLogger('poller');

// ═══════════════════════════════════════
// ── Event emitter ──
// ═══════════════════════════════════════

const pollerEmitter = new EventEmitter();
pollerEmitter.setMaxListeners(50);

// ═══════════════════════════════════════
// ── State ──
// ═══════════════════════════════════════

let pollInterval = null;
let polling = false;
let pollConfig = {
  intervalMs: 10000, // mặc định 10s
  enabled: false
};

// In-memory fallback khi Redis không có
const memorySnapshots = new Map(); // agentId → Map<uid, memberObj>

// Stats
const stats = {
  running: false,
  lastPoll: null,
  totalPolls: 0,
  totalNewDetected: 0,
  totalLostDetected: 0,
  errors: [],
  agentResults: {}
};

// ═══════════════════════════════════════
// ── Helpers ──
// ═══════════════════════════════════════

function getActiveAgents() {
  const db = getDb();
  return db
    .prepare(
      "SELECT id, label, base_url, cookie, user_agent, ee88_username FROM ee88_agents WHERE is_deleted = 0 AND status = 1 AND cookie != ''"
    )
    .all();
}

/**
 * Parse members response từ EE88 thành Map<uid, memberObj>
 */
function parseMembersToMap(data) {
  const map = new Map();
  if (!Array.isArray(data)) return map;
  for (const row of data) {
    const uid = row.uid || row.id;
    if (uid) {
      map.set(Number(uid), {
        uid: Number(uid),
        username: row.username || '',
        balance: parseFloat(row.balance) || 0,
        status: row.status,
        register_time: row.register_time || '',
        last_login_time: row.last_login_time || '',
        user_parent: row.user_parent || '',
        user_parent_format: row.user_parent_format || ''
      });
    }
  }
  return map;
}

/**
 * So sánh 2 snapshot → tìm khách mới + khách mất
 */
function diffSnapshots(oldMap, newMap) {
  const newCustomers = [];
  const lostCustomers = [];

  // Khách mới: có trong newMap nhưng không có trong oldMap
  for (const [uid, member] of newMap) {
    if (!oldMap.has(uid)) {
      newCustomers.push(member);
    }
  }

  // Khách mất: có trong oldMap nhưng không có trong newMap
  for (const [uid, member] of oldMap) {
    if (!newMap.has(uid)) {
      lostCustomers.push(member);
    }
  }

  return { newCustomers, lostCustomers };
}

/**
 * Lưu events vào DB
 */
function saveEvents(agentId, events, eventType) {
  if (events.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    'INSERT INTO customer_events (agent_id, uid, username, event_type, details) VALUES (?, ?, ?, ?, ?)'
  );
  const insertMany = db.transaction((rows) => {
    for (const row of rows) {
      stmt.run(
        agentId,
        row.uid,
        row.username,
        eventType,
        JSON.stringify({
          balance: row.balance,
          register_time: row.register_time,
          last_login_time: row.last_login_time,
          user_parent: row.user_parent_format || row.user_parent
        })
      );
    }
  });
  insertMany(events);
}

/**
 * Lấy hoặc set snapshot (Redis ưu tiên, fallback memory)
 */
async function getSnapshot(agentId) {
  if (redisOk()) {
    const snap = await getMemberSnapshot(agentId);
    if (snap) return snap;
  }
  return memorySnapshots.get(agentId) || null;
}

async function setSnapshot(agentId, memberMap) {
  memorySnapshots.set(agentId, memberMap);
  if (redisOk()) {
    await saveMemberSnapshot(agentId, memberMap).catch(() => {});
  }
}

// ═══════════════════════════════════════
// ── Poll 1 agent ──
// ═══════════════════════════════════════

async function pollAgent(agent) {
  const t0 = Date.now();
  try {
    // Gọi EE88 members API — lấy ALL (page 1, limit 2000)
    const res = await fetchEndpointForAgent(agent, 'members', {
      page: 1,
      limit: 2000
    });

    // Kiểm tra session expired
    if (res && res.url === '/agent/login') {
      log.warn(`[Agent #${agent.id}] Session hết hạn, đang relogin...`);
      await autoRelogin(agent.id);
      return {
        agentId: agent.id,
        label: agent.label,
        status: 'relogin',
        events: []
      };
    }

    // Kiểm tra rate limit (data là string thay vì array)
    if (res && !Array.isArray(res.data)) {
      log.warn(`[Agent #${agent.id}] Rate limited, skip poll`);
      return {
        agentId: agent.id,
        label: agent.label,
        status: 'rate_limited',
        events: []
      };
    }

    const newMap = parseMembersToMap(res.data || []);
    const oldMap = await getSnapshot(agent.id);
    const events = [];

    if (oldMap) {
      const { newCustomers, lostCustomers } = diffSnapshots(oldMap, newMap);

      if (newCustomers.length > 0) {
        saveEvents(agent.id, newCustomers, 'new');
        stats.totalNewDetected += newCustomers.length;
        for (const c of newCustomers) {
          events.push({
            type: 'new',
            agent: agent.label,
            agentId: agent.id,
            ...c
          });
        }
        log.ok(
          `[Agent #${agent.id}] Phát hiện ${newCustomers.length} khách MỚI`
        );
      }

      if (lostCustomers.length > 0) {
        saveEvents(agent.id, lostCustomers, 'lost');
        stats.totalLostDetected += lostCustomers.length;
        for (const c of lostCustomers) {
          events.push({
            type: 'lost',
            agent: agent.label,
            agentId: agent.id,
            ...c
          });
        }
        log.warn(
          `[Agent #${agent.id}] Phát hiện ${lostCustomers.length} khách MẤT`
        );
      }
    } else {
      log.info(
        `[Agent #${agent.id}] Snapshot đầu tiên: ${newMap.size} members`
      );
    }

    // Lưu snapshot mới
    await setSnapshot(agent.id, newMap);

    return {
      agentId: agent.id,
      label: agent.label,
      status: 'ok',
      memberCount: newMap.size,
      events,
      duration: Date.now() - t0
    };
  } catch (err) {
    log.error(`[Agent #${agent.id}] Poll lỗi: ${err.message}`);
    return {
      agentId: agent.id,
      label: agent.label,
      status: 'error',
      error: err.message,
      events: []
    };
  }
}

// ═══════════════════════════════════════
// ── Poll all agents (1 cycle) ──
// ═══════════════════════════════════════

async function pollCycle() {
  if (polling) {
    log.warn('Poll cycle đang chạy, skip');
    return;
  }

  polling = true;
  stats.running = true;
  const t0 = Date.now();

  try {
    const agents = getActiveAgents();
    if (agents.length === 0) {
      log.warn('Không có agent active để poll');
      return;
    }

    // Poll tuần tự (tránh rate limit EE88)
    const allEvents = [];
    for (const agent of agents) {
      const result = await pollAgent(agent);
      stats.agentResults[agent.id] = {
        label: agent.label,
        status: result.status,
        memberCount: result.memberCount || 0,
        lastPoll: new Date().toISOString(),
        duration: result.duration || 0
      };

      if (result.events && result.events.length > 0) {
        allEvents.push(...result.events);
      }
    }

    // Emit events qua EventEmitter → WebSocket sẽ bắt
    if (allEvents.length > 0) {
      pollerEmitter.emit('customer_events', allEvents);
    }

    stats.totalPolls++;
    stats.lastPoll = new Date().toISOString();

    const duration = Date.now() - t0;
    if (allEvents.length > 0) {
      log.ok(
        `Poll cycle #${stats.totalPolls} hoàn tất (${duration}ms) — ${allEvents.length} events`
      );
    }
  } catch (err) {
    log.error(`Poll cycle lỗi: ${err.message}`);
    stats.errors.push({ time: new Date().toISOString(), error: err.message });
    if (stats.errors.length > 50) stats.errors.shift();
  } finally {
    polling = false;
    stats.running = false;
  }
}

// ═══════════════════════════════════════
// ── Control API ──
// ═══════════════════════════════════════

/**
 * Bắt đầu polling
 * @param {number} intervalMs — khoảng cách giữa các lần poll (ms)
 */
function startPolling(intervalMs) {
  if (pollInterval) {
    log.warn('Polling đã đang chạy, stop trước khi start lại');
    stopPolling();
  }

  const ms = intervalMs || pollConfig.intervalMs;
  pollConfig.intervalMs = ms;
  pollConfig.enabled = true;

  // Poll ngay lần đầu
  pollCycle();

  // Set interval
  pollInterval = setInterval(pollCycle, ms);
  log.ok(`Polling đã bắt đầu — interval ${ms / 1000}s`);
}

/**
 * Dừng polling
 */
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  pollConfig.enabled = false;
  stats.running = false;
  log.info('Polling đã dừng');
}

/**
 * Lấy trạng thái hiện tại
 */
function getStatus() {
  return {
    enabled: pollConfig.enabled,
    intervalMs: pollConfig.intervalMs,
    ...stats
  };
}

/**
 * Lấy events từ DB (phân trang)
 */
function getEvents({
  page = 1,
  limit = 50,
  eventType,
  agentId,
  unreadOnly
} = {}) {
  const db = getDb();
  const conditions = [];
  const params = [];

  if (eventType) {
    conditions.push('ce.event_type = ?');
    params.push(eventType);
  }
  if (agentId) {
    conditions.push('ce.agent_id = ?');
    params.push(agentId);
  }
  if (unreadOnly) {
    conditions.push('ce.is_read = 0');
  }

  const where =
    conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
  const offset = (page - 1) * limit;

  const rows = db
    .prepare(
      `
    SELECT ce.*, ea.label as agent_label
    FROM customer_events ce
    LEFT JOIN ee88_agents ea ON ea.id = ce.agent_id
    ${where}
    ORDER BY ce.detected_at DESC
    LIMIT ? OFFSET ?
  `
    )
    .all(...params, limit, offset);

  const total = db
    .prepare(
      `
    SELECT COUNT(*) as cnt FROM customer_events ce ${where}
  `
    )
    .get(...params).cnt;

  const unreadCount = db
    .prepare('SELECT COUNT(*) as cnt FROM customer_events WHERE is_read = 0')
    .get().cnt;

  return { rows, total, unreadCount, page, limit };
}

/**
 * Đánh dấu events đã đọc
 */
function markRead(ids) {
  const db = getDb();
  if (ids === 'all') {
    db.prepare(
      'UPDATE customer_events SET is_read = 1 WHERE is_read = 0'
    ).run();
  } else if (Array.isArray(ids) && ids.length > 0) {
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(
      `UPDATE customer_events SET is_read = 1 WHERE id IN (${placeholders})`
    ).run(...ids);
  }
}

/**
 * Xoá events cũ (dọn dẹp)
 */
function clearEvents(beforeDate) {
  const db = getDb();
  if (beforeDate) {
    db.prepare('DELETE FROM customer_events WHERE detected_at < ?').run(
      beforeDate
    );
  } else {
    db.prepare('DELETE FROM customer_events').run();
  }
}

module.exports = {
  pollerEmitter,
  startPolling,
  stopPolling,
  getStatus,
  getEvents,
  markRead,
  clearEvents,
  pollCycle
};
