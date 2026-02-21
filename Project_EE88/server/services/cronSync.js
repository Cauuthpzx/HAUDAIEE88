/**
 * Sync Engine v2 — đồng bộ dữ liệu EE88 vào SQLite
 *
 * Thiết kế: TUẦN TỰ HOÀN TOÀN — ưu tiên ĐẦY ĐỦ trước, tốc độ sau.
 *
 * Flow per agent:
 *   Step 1: Snapshot endpoints (invites → members) — tuần tự
 *   Step 2: Date endpoints (66 ngày, old→new) — từng ngày, từng endpoint tuần tự
 *     - Ngày đã lock → skip
 *     - Hôm nay → luôn re-sync, KHÔNG lock
 *     - Mỗi endpoint: fetch ALL pages → verify → save
 *     - Tất cả 7 eps OK + verified → lock ngày
 *   Step 3: bet-orders (API trả ALL data) — fetch ALL pages tuần tự
 *
 * Multi-agent (run-all): TUẦN TỰ — sync từng agent một.
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');
const { getDb } = require('../database/init');
const { fetchEndpointForAgent } = require('./ee88Client');
const { autoRelogin } = require('./loginService');
const dataStore = require('./dataStore');
const ENDPOINTS = require('../config/endpoints');
const config = require('../config/default');
const { createLogger } = require('../utils/logger');

const log = createLogger('sync');

// ═══════════════════════════════════════
// ── Constants ──
// ═══════════════════════════════════════

const SYNC_DAYS = config.sync.days;
const MAX_RETRIES = config.sync.maxRetries;
const PAGE_SIZE = config.sync.pageSize;
const RATE_LIMIT_DELAY = config.sync.rateLimitDelay;
const ERROR_DELAY = config.sync.errorDelay;
const SYNC_TIMEOUT = config.sync.timeout;

const SNAPSHOT_EPS = ['invites', 'members'];
const DATE_EPS = [
  'deposits',
  'withdrawals',
  'lottery-bets',
  'report-lottery',
  'report-funds',
  'report-third'
];
// lottery-bets-summary: chỉ lấy total_data (page 1), không có COLUMN_MAP → không save rows
const TOTALS_ONLY_EPS = ['lottery-bets-summary'];

// Tham khảo EE88 1 reference project:
// - report-*: dùng param `date` với format "YYYY-MM-DD | YYYY-MM-DD" (pipe có space)
// - deposits/withdrawals: dùng start_time/end_time với datetime đầy đủ
// - lottery-bets: dùng hs_date_time với datetime đầy đủ
const DATE_PARAM_MAP = {
  deposits: { start: 'start_time', end: 'end_time', withTime: true },
  withdrawals: { start: 'start_time', end: 'end_time', withTime: true },
  'report-lottery': { type: 'range', param: 'date', sep: ' | ' },
  'report-funds': { type: 'range', param: 'date', sep: ' | ' },
  'report-third': { type: 'range', param: 'date', sep: ' | ' },
  'lottery-bets': {
    type: 'range',
    param: 'hs_date_time',
    sep: '|',
    withTime: true
  },
  'lottery-bets-summary': {
    type: 'range',
    param: 'hs_date_time',
    sep: '|',
    withTime: true
  }
};

// ═══════════════════════════════════════
// ── SSE Progress ──
// ═══════════════════════════════════════

const syncEmitter = new EventEmitter();
syncEmitter.setMaxListeners(20);
const syncProgress = new Map();

function epName(key) {
  return (ENDPOINTS[key] && ENDPOINTS[key].description) || key;
}

// ═══════════════════════════════════════
// ── Progress tracking ──
// ═══════════════════════════════════════

function initProgress(agentId, label) {
  syncProgress.set(agentId, {
    label,
    status: 'syncing',
    startedAt: Date.now(),
    currentStep: 'snapshots',
    snapshots: {},
    dates: {
      total: SYNC_DAYS + 1,
      completed: 0,
      skipped: 0,
      currentDate: null,
      currentEndpoint: null,
      currentPage: 0,
      totalPages: 0,
      endpoints: {}
    },
    betOrders: {
      status: 'pending',
      rows: 0,
      currentPage: 0,
      totalPages: 0,
      error: null
    }
  });

  // Init snapshot eps
  for (const ep of SNAPSHOT_EPS) {
    syncProgress.get(agentId).snapshots[ep] = {
      name: epName(ep),
      status: 'pending',
      rows: 0,
      currentPage: 0,
      totalPages: 0,
      error: null
    };
  }

  emitProgress();
}

function updateProgress(agentId, path, fields) {
  const p = syncProgress.get(agentId);
  if (!p) return;

  // path can be 'snapshots.members', 'dates', 'dates.endpoints.deposits', 'betOrders'
  const parts = path.split('.');
  let target = p;
  for (const part of parts) {
    if (!target[part]) target[part] = {};
    target = target[part];
  }
  Object.assign(target, fields);
  emitProgress();
}

function emitProgress() {
  syncEmitter.emit('progress', getSyncProgressSnapshot());
  printSyncTree();
}

function getSyncProgressSnapshot() {
  const agents = [];
  for (const [agentId, p] of syncProgress) {
    // Convert to flat endpoint list for UI compatibility
    const eps = [];

    // Snapshot endpoints
    for (const ep of SNAPSHOT_EPS) {
      const s = p.snapshots[ep] || {};
      eps.push({
        key: ep,
        name: s.name || epName(ep),
        total: 1,
        completed: s.status === 'done' ? 1 : 0,
        rows: s.rows || 0,
        status: s.status || 'pending',
        currentPage: s.currentPage || 0,
        totalPages: s.totalPages || 0,
        error: s.error || null
      });
    }

    // Date endpoints (aggregate across all dates)
    for (const ep of DATE_EPS) {
      const d = p.dates || {};
      const epStatus = d.endpoints && d.endpoints[ep];
      eps.push({
        key: ep,
        name: epName(ep),
        total: d.total || SYNC_DAYS + 1,
        completed: d.completed || 0,
        rows: epStatus ? epStatus.totalRows || 0 : 0,
        status:
          d.currentEndpoint === ep
            ? 'syncing'
            : d.completed >= (d.total || SYNC_DAYS + 1)
              ? epStatus && epStatus.status === 'error'
                ? 'error'
                : 'done'
              : 'pending',
        currentPage: d.currentEndpoint === ep ? d.currentPage || 0 : 0,
        totalPages: d.currentEndpoint === ep ? d.totalPages || 0 : 0,
        error: epStatus ? epStatus.error || null : null
      });
    }

    // Totals-only endpoints (lottery-bets-summary) — hiển thị nhưng không có rows
    for (const ep of TOTALS_ONLY_EPS) {
      const d = p.dates || {};
      eps.push({
        key: ep,
        name: epName(ep),
        total: d.total || SYNC_DAYS + 1,
        completed: d.completed || 0,
        rows: 0,
        status: d.completed >= (d.total || SYNC_DAYS + 1) ? 'done' : 'pending',
        currentPage: 0,
        totalPages: 0,
        error: null
      });
    }

    // bet-orders
    const bo = p.betOrders || {};
    eps.push({
      key: 'bet-orders',
      name: epName('bet-orders'),
      total: 1,
      completed: bo.status === 'done' ? 1 : 0,
      rows: bo.rows || 0,
      status: bo.status || 'pending',
      currentPage: bo.currentPage || 0,
      totalPages: bo.totalPages || 0,
      error: bo.error || null
    });

    agents.push({
      agentId,
      label: p.label,
      status: p.status,
      elapsed: Date.now() - p.startedAt,
      currentStep: p.currentStep,
      currentDate: p.dates ? p.dates.currentDate : null,
      endpoints: eps
    });
  }
  return { agents, timestamp: Date.now() };
}

// ═══════════════════════════════════════
// ── Console progress tree ──
// ═══════════════════════════════════════

const CLR = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  gray: '\x1b[90m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m'
};

let _treeHeight = 0;
let _treeThrottle = 0;

function progressBar(completed, total, width) {
  const pct = total > 0 ? completed / total : 0;
  const f = Math.round(pct * width);
  return (
    CLR.green + '█'.repeat(f) + CLR.gray + '░'.repeat(width - f) + CLR.reset
  );
}

function fmtSec(ms) {
  const s = Math.round(ms / 1000);
  return s >= 60
    ? Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's'
    : s + 's';
}

function statusIcon(st) {
  if (st === 'done') return CLR.green + '✓' + CLR.reset;
  if (st === 'error') return CLR.red + '✗' + CLR.reset;
  if (st === 'syncing') return CLR.cyan + '▶' + CLR.reset;
  if (st === 'skipped') return CLR.gray + '─' + CLR.reset;
  return CLR.gray + '·' + CLR.reset;
}

function printSyncTree(force) {
  const now = Date.now();
  if (!force && now - _treeThrottle < 800) return;
  _treeThrottle = now;

  const snap = getSyncProgressSnapshot();
  if (!snap.agents || snap.agents.length === 0) {
    clearSyncTree();
    return;
  }

  if (_treeHeight > 0) {
    process.stdout.write('\x1b[' + _treeHeight + 'A\x1b[0J');
  }

  const lines = [];
  for (const a of snap.agents) {
    const t = CLR.cyan + fmtSec(a.elapsed || 0) + CLR.reset;
    const step = a.currentStep || '';
    const dateInfo = a.currentDate ? ` [${a.currentDate}]` : '';
    lines.push(
      `  ${CLR.bold}┌ ${a.label}${CLR.reset} ${'─'.repeat(20)} ${step}${dateInfo} ${t}`
    );

    const eps = a.endpoints || [];
    eps.forEach((ep, i) => {
      const pre = i === eps.length - 1 ? '  └ ' : '  │ ';
      const name = (ep.name || ep.key).substring(0, 16).padEnd(16);
      const b = progressBar(ep.completed, ep.total, 15);
      const cnt = `${ep.completed}/${ep.total}`.padStart(6);
      const ic = statusIcon(ep.status);
      const rows =
        ep.rows > 0
          ? CLR.gray + ` ${ep.rows.toLocaleString()}r` + CLR.reset
          : '';
      const pageInfo =
        ep.totalPages > 1
          ? CLR.yellow + ` p${ep.currentPage || 0}/${ep.totalPages}` + CLR.reset
          : '';
      lines.push(`${pre}${name} ${b} ${cnt} ${ic}${rows}${pageInfo}`);
    });
  }

  process.stdout.write(lines.join('\n') + '\n');
  _treeHeight = lines.length;
}

function clearSyncTree() {
  if (_treeHeight > 0) {
    process.stdout.write('\x1b[' + _treeHeight + 'A\x1b[0J');
    _treeHeight = 0;
  }
}

// ═══════════════════════════════════════
// ── Helpers ──
// ═══════════════════════════════════════

function fmtDate(d) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildDateParams(ep, dateStr) {
  const m = DATE_PARAM_MAP[ep];
  if (!m) return {};
  if (m.type === 'range') {
    // withTime: hs_date_time → "YYYY-MM-DD 00:00:00|YYYY-MM-DD 23:59:59"
    // không withTime: date → "YYYY-MM-DD | YYYY-MM-DD" (giống reference EE88 1)
    if (m.withTime) {
      return {
        [m.param]: dateStr + ' 00:00:00' + m.sep + dateStr + ' 23:59:59'
      };
    }
    const params = { [m.param]: dateStr + m.sep + dateStr };
    // Giống reference: thêm username= cho report endpoints
    params.username = '';
    // Lottery cần thêm lottery_id=
    if (ep === 'report-lottery') params.lottery_id = '';
    return params;
  }
  // deposits/withdrawals: start_time/end_time đầy đủ datetime
  return { [m.start]: dateStr + ' 00:00:00', [m.end]: dateStr + ' 23:59:59' };
}

// ═══════════════════════════════════════
// ── Day lock ──
// ═══════════════════════════════════════

function isDayLocked(agentId, dateKey) {
  const db = getDb();
  return !!db
    .prepare('SELECT 1 FROM sync_day_locks WHERE agent_id = ? AND date_key = ?')
    .get(agentId, dateKey);
}

function lockDay(agentId, dateKey, rowCounts) {
  const db = getDb();
  const hash = crypto
    .createHash('md5')
    .update(JSON.stringify(rowCounts))
    .digest('hex');
  db.prepare(
    `INSERT OR REPLACE INTO sync_day_locks (agent_id, date_key, data_hash, row_counts, locked_at)
     VALUES (?, ?, ?, ?, datetime('now', 'localtime'))`
  ).run(agentId, dateKey, hash, JSON.stringify(rowCounts));
}

function getLockedDays(agentId) {
  const db = getDb();
  return db
    .prepare(
      'SELECT date_key, data_hash, row_counts, locked_at FROM sync_day_locks WHERE agent_id = ? ORDER BY date_key'
    )
    .all(agentId);
}

function clearLocks(agentId) {
  const db = getDb();
  const r = db
    .prepare('DELETE FROM sync_day_locks WHERE agent_id = ?')
    .run(agentId);
  return r.changes;
}

// ═══════════════════════════════════════
// ── Fetch with relogin ──
// ═══════════════════════════════════════

async function fetchWithRelogin(agent, ep, params) {
  try {
    return await fetchEndpointForAgent(agent, ep, params);
  } catch (err) {
    if (err.code === 'SESSION_EXPIRED') {
      log.warn(`[${agent.label}] phiên hết hạn — đăng nhập lại...`);
      const newAgent = await autoRelogin(agent);
      if (newAgent) {
        Object.assign(agent, {
          cookie: newAgent.cookie,
          user_agent: newAgent.user_agent
        });
        return await fetchEndpointForAgent(newAgent, ep, params);
      }
    }
    throw err;
  }
}

// ═══════════════════════════════════════
// ── Fetch ALL pages of an endpoint (tuần tự) ──
// ═══════════════════════════════════════

/**
 * Fetch tất cả pages của 1 endpoint, save từng batch vào DB.
 * Trả về { totalRows, totalData, verified, apiCount }.
 *
 * @param {object} agent
 * @param {string} ep — endpoint key
 * @param {object} params — query params (date, filters...)
 * @param {string|null} dateKey — "YYYY-MM-DD|YYYY-MM-DD" cho report endpoints
 * @param {function|null} onPage — callback(info) per page
 */
async function fetchAllPages(agent, ep, params, dateKey, onPage) {
  let lastErr;
  let totalRows = 0;
  let totalData = null;
  let totalPages = 1;
  let apiCount = 0;
  let resumePage = 1;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // ── Page 1 ──
      if (resumePage <= 1) {
        const res1 = await fetchWithRelogin(agent, ep, {
          ...params,
          page: 1,
          limit: PAGE_SIZE
        });

        if (!res1 || res1.code !== 0) {
          throw new Error(
            (res1 && res1.msg) || 'API code ' + (res1 ? res1.code : 'null')
          );
        }

        // Rate-limit detection
        if (!Array.isArray(res1.data)) {
          throw Object.assign(new Error('API rate-limited (data is string)'), {
            isRateLimit: true
          });
        }

        totalData = res1.total_data || null;
        const firstBatch = res1.data;
        apiCount = parseInt(res1.count) || firstBatch.length;
        totalPages = Math.ceil(apiCount / PAGE_SIZE);

        if (firstBatch.length > 0) {
          dataStore.saveData(agent.id, ep, firstBatch, null, dateKey);
          totalRows += firstBatch.length;
        }

        if (onPage) onPage({ page: 1, totalPages, rows: totalRows });
        resumePage = 2;
      }

      // ── Remaining pages ──
      for (let page = resumePage; page <= totalPages; page++) {
        const resN = await fetchWithRelogin(agent, ep, {
          ...params,
          page,
          limit: PAGE_SIZE
        });

        if (
          resN &&
          resN.code === 0 &&
          Array.isArray(resN.data) &&
          resN.data.length > 0
        ) {
          dataStore.saveData(agent.id, ep, resN.data, null, dateKey);
          totalRows += resN.data.length;
          if (onPage) onPage({ page, totalPages, rows: totalRows });
          resumePage = page + 1;
          if (resN.data.length < PAGE_SIZE) break; // Last page
        } else if (resN && !Array.isArray(resN.data)) {
          throw Object.assign(new Error('API rate-limited (data is string)'), {
            isRateLimit: true
          });
        } else {
          break; // Empty page — no more data
        }
      }

      // Save totals nếu có
      if (totalData && dateKey) {
        dataStore.saveTotals(agent.id, ep, dateKey, totalData);
      }

      // Verify: fetched >= API count (API count có thể thay đổi giữa pages)
      const verified = totalRows >= apiCount;

      return { totalRows, totalData, verified, apiCount };
    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        const delay = e.isRateLimit ? RATE_LIMIT_DELAY : ERROR_DELAY;
        log.warn(
          `[${agent.label}] ${ep} p${resumePage} retry ${attempt + 1}/${MAX_RETRIES}` +
            (e.isRateLimit
              ? ` (rate-limited, đợi ${delay / 1000}s)`
              : ` (${e.message})`)
        );
        await sleep(delay);
      }
    }
  }
  throw lastErr;
}

// ═══════════════════════════════════════
// ── Main sync flow ──
// ═══════════════════════════════════════

const agentSyncLocks = new Map();

async function syncAfterLogin(agentId) {
  if (agentSyncLocks.get(agentId)) {
    log.warn(`[Agent #${agentId}] đang đồng bộ, bỏ qua`);
    return;
  }
  agentSyncLocks.set(agentId, true);

  const db = getDb();
  const agent = db
    .prepare('SELECT * FROM ee88_agents WHERE id = ? AND status = 1')
    .get(agentId);
  if (!agent) {
    agentSyncLocks.delete(agentId);
    return;
  }

  initProgress(agentId, agent.label);
  const startTime = Date.now();

  // Timeout guard
  let syncAborted = false;
  const timeoutId = setTimeout(() => {
    syncAborted = true;
    log.error(
      `[${agent.label}] TIMEOUT — sync quá ${SYNC_TIMEOUT / 60000} phút, huỷ bỏ`
    );
  }, SYNC_TIMEOUT);

  try {
    const today = fmtDate(new Date());

    // Dọn locks cũ ngoài window (ngày < today - SYNC_DAYS)
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() - SYNC_DAYS);
    const windowStartStr = fmtDate(windowStart);
    const cleaned = db
      .prepare('DELETE FROM sync_day_locks WHERE agent_id = ? AND date_key < ?')
      .run(agentId, windowStartStr);
    if (cleaned.changes > 0) {
      log.info(
        `[${agent.label}] Dọn ${cleaned.changes} lock cũ (trước ${windowStartStr})`
      );
    }

    // ══════════════════════════════════════
    // Step 1: Snapshot endpoints (tuần tự)
    // ══════════════════════════════════════
    log.info(`[${agent.label}] Step 1: Snapshot endpoints...`);
    updateProgress(agentId, '', { currentStep: 'snapshots' });

    for (const ep of SNAPSHOT_EPS) {
      if (syncAborted) break;

      updateProgress(agentId, `snapshots.${ep}`, { status: 'syncing' });
      try {
        const result = await fetchAllPages(agent, ep, {}, null, (info) => {
          updateProgress(agentId, `snapshots.${ep}`, {
            currentPage: info.page,
            totalPages: info.totalPages,
            rows: info.rows
          });
        });
        updateProgress(agentId, `snapshots.${ep}`, {
          status: 'done',
          rows: result.totalRows
        });
        log.info(
          `[${agent.label}] ${epName(ep)}: ${result.totalRows} rows (verified=${result.verified})`
        );
      } catch (e) {
        updateProgress(agentId, `snapshots.${ep}`, {
          status: 'error',
          error: e.message
        });
        clearSyncTree();
        log.error(`[${agent.label}] ${epName(ep)} lỗi: ${e.message}`);
      }
    }

    const step1Sec = ((Date.now() - startTime) / 1000).toFixed(0);
    log.info(`[${agent.label}] Step 1 xong — ${step1Sec}s`);

    // ══════════════════════════════════════
    // Step 2: Date endpoints (tuần tự từng ngày)
    // ══════════════════════════════════════
    if (!syncAborted) {
      log.info(
        `[${agent.label}] Step 2: Date endpoints (${SYNC_DAYS + 1} ngày)...`
      );
      updateProgress(agentId, '', { currentStep: 'dates' });

      // Build date list: [today - SYNC_DAYS ... today]
      const dates = [];
      for (let i = SYNC_DAYS; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(fmtDate(d));
      }

      // Track total rows per date endpoint (for progress display)
      const epTotalRows = {};
      DATE_EPS.forEach((ep) => {
        epTotalRows[ep] = 0;
      });

      let datesCompleted = 0;
      let datesSkipped = 0;

      for (const dateStr of dates) {
        if (syncAborted) break;

        const isToday = dateStr === today;

        // Skip locked days (trừ hôm nay)
        if (!isToday && isDayLocked(agent.id, dateStr)) {
          datesSkipped++;
          datesCompleted++;
          updateProgress(agentId, 'dates', {
            completed: datesCompleted,
            skipped: datesSkipped
          });
          continue;
        }

        updateProgress(agentId, 'dates', {
          currentDate: dateStr,
          completed: datesCompleted
        });

        const dateKeyFull = dateStr + '|' + dateStr;
        const dayRowCounts = {};
        let allOk = true;
        let allVerified = true;

        // Sync từng endpoint tuần tự
        for (const ep of DATE_EPS) {
          if (syncAborted) {
            allOk = false;
            break;
          }

          updateProgress(agentId, 'dates', {
            currentEndpoint: ep,
            currentPage: 0,
            totalPages: 0
          });

          try {
            // Xoá data cũ của ngày này trước khi fetch mới — tránh trùng lặp
            const deleted = dataStore.deleteDataForDay(agent.id, ep, dateStr);
            if (deleted > 0) {
              log.info(
                `[${agent.label}] ${dateStr} ${ep}: xoá ${deleted} rows cũ trước khi re-sync`
              );
            }

            const params = buildDateParams(ep, dateStr);
            const result = await fetchAllPages(
              agent,
              ep,
              params,
              dateKeyFull,
              (info) => {
                updateProgress(agentId, 'dates', {
                  currentPage: info.page,
                  totalPages: info.totalPages
                });
              }
            );

            dayRowCounts[ep] = result.totalRows;
            epTotalRows[ep] += result.totalRows;

            if (!result.verified) {
              allVerified = false;
              log.warn(
                `[${agent.label}] ${dateStr} ${ep}: verify FAIL (got ${result.totalRows}, API says ${result.apiCount})`
              );
            }

            updateProgress(agentId, `dates.endpoints.${ep}`, {
              status: 'done',
              totalRows: epTotalRows[ep],
              verified: result.verified
            });
          } catch (e) {
            allOk = false;
            dayRowCounts[ep] = -1;
            clearSyncTree();
            log.error(`[${agent.label}] ${dateStr} ${ep} lỗi: ${e.message}`);
            updateProgress(agentId, `dates.endpoints.${ep}`, {
              status: 'error',
              error: e.message
            });
            // Tiếp tục endpoint tiếp theo — không dừng
          }
        }

        // Fetch totals-only endpoints (lottery-bets-summary) — chỉ lấy page 1 cho total_data
        for (const ep of TOTALS_ONLY_EPS) {
          if (syncAborted) break;
          try {
            const params = buildDateParams(ep, dateStr);
            const res = await fetchWithRelogin(agent, ep, {
              ...params,
              page: 1,
              limit: 10
            });
            if (res && res.code === 0 && res.total_data && dateKeyFull) {
              dataStore.saveTotals(agent.id, ep, dateKeyFull, res.total_data);
            }
            dayRowCounts[ep] = Array.isArray(res.data) ? res.data.length : 0;
          } catch (e) {
            // Totals-only endpoint fail không ảnh hưởng lock
            log.warn(
              `[${agent.label}] ${dateStr} ${ep} (totals): ${e.message}`
            );
          }
        }

        datesCompleted++;
        updateProgress(agentId, 'dates', {
          completed: datesCompleted,
          currentEndpoint: null
        });

        // Lock ngày nếu: không phải hôm nay + tất cả OK + verified
        if (!isToday && allOk && allVerified) {
          lockDay(agent.id, dateStr, dayRowCounts);
        } else if (!isToday && (!allOk || !allVerified)) {
          log.warn(
            `[${agent.label}] ${dateStr} KHÔNG lock (allOk=${allOk}, verified=${allVerified})`
          );
        }
      }

      const step2Sec = ((Date.now() - startTime) / 1000).toFixed(0);
      log.info(
        `[${agent.label}] Step 2 xong — ${step2Sec}s (${datesCompleted} ngày, ${datesSkipped} skipped)`
      );
    }

    // ══════════════════════════════════════
    // Step 3: bet-orders (API trả ALL data bất kể date)
    // ══════════════════════════════════════
    if (!syncAborted) {
      log.info(`[${agent.label}] Step 3: bet-orders (ALL data)...`);
      updateProgress(agentId, '', { currentStep: 'bet-orders' });
      updateProgress(agentId, 'betOrders', { status: 'syncing' });

      try {
        // bet-orders API ignores date filter → start_time=today chỉ để trigger pagination
        const params = { start_time: today, end_time: today };
        const result = await fetchAllPages(
          agent,
          'bet-orders',
          params,
          null,
          (info) => {
            updateProgress(agentId, 'betOrders', {
              currentPage: info.page,
              totalPages: info.totalPages,
              rows: info.rows
            });
          }
        );
        updateProgress(agentId, 'betOrders', {
          status: 'done',
          rows: result.totalRows
        });
        log.info(
          `[${agent.label}] bet-orders: ${result.totalRows} rows (verified=${result.verified})`
        );
      } catch (e) {
        updateProgress(agentId, 'betOrders', {
          status: 'error',
          error: e.message
        });
        clearSyncTree();
        log.error(`[${agent.label}] bet-orders lỗi: ${e.message}`);
      }
    }

    const totalSec = ((Date.now() - startTime) / 1000).toFixed(0);
    clearSyncTree();
    log.ok(`[${agent.label}] đồng bộ hoàn tất — ${totalSec}s`);
  } catch (e) {
    clearSyncTree();
    log.error(`[${agent.label}] đồng bộ lỗi: ${e.message}`);
    const p = syncProgress.get(agentId);
    if (p) {
      p.status = 'error';
      emitProgress();
    }
  } finally {
    clearTimeout(timeoutId);
    agentSyncLocks.delete(agentId);
    const p = syncProgress.get(agentId);
    if (p && p.status === 'syncing') {
      p.status = syncAborted ? 'error' : 'done';
      emitProgress();
    }
    // Giữ progress 60s để client kịp thấy kết quả
    setTimeout(() => {
      syncProgress.delete(agentId);
      emitProgress();
    }, 60000);
  }
}

// ═══════════════════════════════════════
// ── Sync all agents (TUẦN TỰ — từng agent một) ──
// ═══════════════════════════════════════

async function syncAllAgents() {
  const db = getDb();
  const agents = db
    .prepare('SELECT * FROM ee88_agents WHERE status = 1 AND is_deleted = 0')
    .all();
  if (agents.length === 0) {
    log.warn('Không có agent active');
    return;
  }

  log.info(`Bắt đầu đồng bộ ${agents.length} đại lý (tuần tự)`);
  for (const agent of agents) {
    if (agentSyncLocks.get(agent.id)) {
      log.warn(`[${agent.label}] đang sync, bỏ qua`);
      continue;
    }
    try {
      await syncAfterLogin(agent.id);
    } catch (e) {
      log.error(`[${agent.label}] sync thất bại: ${e.message}`);
    }
  }
  log.ok(`Đồng bộ toàn bộ ${agents.length} đại lý hoàn tất`);
}

function isSyncRunning() {
  return agentSyncLocks.size > 0;
}
function isAgentSyncing(agentId) {
  return !!agentSyncLocks.get(agentId);
}

module.exports = {
  syncAfterLogin,
  syncAllAgents,
  isSyncRunning,
  isAgentSyncing,
  syncEmitter,
  getSyncProgressSnapshot,
  getLockedDays,
  clearLocks
};
