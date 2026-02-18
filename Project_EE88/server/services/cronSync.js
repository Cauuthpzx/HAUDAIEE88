/**
 * Sync Engine — đồng bộ dữ liệu EE88 vào SQLite
 *
 * Flow per agent:
 *   1. members + invites (song song) → chờ cả 2 xong
 *   2. 65 ngày × 8 date endpoints (song song per ngày) → chờ 8 xong mới qua ngày tiếp
 *   3. Ngày đã khoá (hash) → bỏ qua
 *   4. Xong ngày → hash + lock
 *
 * Progress: 10 thanh (2 non-date + 8 date), mỗi thanh riêng
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');
const { getDb } = require('../database/init');
const { fetchEndpointForAgent } = require('./ee88Client');
const { autoRelogin } = require('./loginService');
const dataStore = require('./dataStore');
const ENDPOINTS = require('../config/endpoints');
const { createLogger } = require('../utils/logger');

const log = createLogger('sync');

// ═══════════════════════════════════════
// ── Constants ──
// ═══════════════════════════════════════

const SYNC_DAYS = 65;
const MAX_RETRIES = 2;
const PAGE_SIZE = 500;

const NON_DATE_EPS = ['members', 'invites'];
const DATE_EPS = [
  'deposits', 'withdrawals', 'bet-orders', 'lottery-bets',
  'lottery-bets-summary', 'report-lottery', 'report-funds', 'report-third'
];
const ALL_EPS = [...NON_DATE_EPS, ...DATE_EPS];

const DATE_PARAM_MAP = {
  deposits:               { start: 'start_time', end: 'end_time' },
  withdrawals:            { start: 'start_time', end: 'end_time' },
  'bet-orders':           { start: 'start_time', end: 'end_time' },
  'report-lottery':       { start: 'start_time', end: 'end_time' },
  'report-funds':         { start: 'start_time', end: 'end_time' },
  'report-third':         { start: 'start_time', end: 'end_time' },
  'lottery-bets':         { type: 'range', param: 'hs_date_time', sep: '|' },
  'lottery-bets-summary': { type: 'range', param: 'hs_date_time', sep: '|' }
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

function initProgress(agentId, label) {
  const endpoints = {};
  NON_DATE_EPS.forEach(ep => {
    endpoints[ep] = { name: epName(ep), total: 1, completed: 0, rows: 0, status: 'pending' };
  });
  DATE_EPS.forEach(ep => {
    endpoints[ep] = { name: epName(ep), total: SYNC_DAYS, completed: 0, rows: 0, status: 'pending' };
  });
  syncProgress.set(agentId, { label, status: 'syncing', startedAt: Date.now(), endpoints });
  emitProgress();
}

function updateEp(agentId, epKey, fields) {
  const p = syncProgress.get(agentId);
  if (!p || !p.endpoints[epKey]) return;
  Object.assign(p.endpoints[epKey], fields);
  emitProgress();
}

function emitProgress() {
  syncEmitter.emit('progress', getSyncProgressSnapshot());
  printSyncTree();
}

function getSyncProgressSnapshot() {
  const agents = [];
  for (const [agentId, p] of syncProgress) {
    const eps = [];
    for (const key of ALL_EPS) {
      const ep = p.endpoints[key];
      if (ep) eps.push({ key, ...ep });
    }
    agents.push({ agentId, label: p.label, status: p.status, elapsed: Date.now() - p.startedAt, endpoints: eps });
  }
  return { agents, timestamp: Date.now() };
}

// ═══════════════════════════════════════
// ── Console progress tree ──
// ═══════════════════════════════════════

const CLR = {
  reset: '\x1b[0m', bold: '\x1b[1m',
  gray: '\x1b[90m', cyan: '\x1b[36m', green: '\x1b[32m',
  red: '\x1b[31m', yellow: '\x1b[33m'
};

let _treeHeight = 0;
let _treeThrottle = 0;

function progressBar(completed, total, width) {
  const pct = total > 0 ? completed / total : 0;
  const f = Math.round(pct * width);
  return CLR.green + '█'.repeat(f) + CLR.gray + '░'.repeat(width - f) + CLR.reset;
}

function fmtSec(ms) {
  const s = Math.round(ms / 1000);
  return s >= 60 ? Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's' : s + 's';
}

function statusIcon(st) {
  if (st === 'done') return CLR.green + '✓' + CLR.reset;
  if (st === 'error') return CLR.red + '✗' + CLR.reset;
  if (st === 'syncing') return CLR.cyan + '▶' + CLR.reset;
  return CLR.gray + '·' + CLR.reset;
}

function printSyncTree(force) {
  const now = Date.now();
  if (!force && now - _treeThrottle < 800) return;
  _treeThrottle = now;

  const snap = getSyncProgressSnapshot();
  if (!snap.agents || snap.agents.length === 0) { clearSyncTree(); return; }

  if (_treeHeight > 0) {
    process.stdout.write('\x1b[' + _treeHeight + 'A\x1b[0J');
  }

  const lines = [];
  for (const a of snap.agents) {
    const t = CLR.cyan + fmtSec(a.elapsed || 0) + CLR.reset;
    lines.push(`  ${CLR.bold}┌ ${a.label}${CLR.reset} ${'─'.repeat(30)} ${t}`);

    const eps = a.endpoints || [];
    eps.forEach((ep, i) => {
      const pre = i === eps.length - 1 ? '  └ ' : '  │ ';
      const name = (ep.name || ep.key).substring(0, 16).padEnd(16);
      const b = progressBar(ep.completed, ep.total, 15);
      const cnt = `${ep.completed}/${ep.total}`.padStart(6);
      const ic = statusIcon(ep.status);
      const rows = ep.rows > 0 ? CLR.gray + ` ${ep.rows.toLocaleString()}r` + CLR.reset : '';
      lines.push(`${pre}${name} ${b} ${cnt} ${ic}${rows}`);
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
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function buildDateParams(ep, dateStr) {
  const m = DATE_PARAM_MAP[ep];
  if (!m) return {};
  if (m.type === 'range') {
    return { [m.param]: dateStr + ' 00:00:00' + m.sep + dateStr + ' 23:59:59' };
  }
  return { [m.start]: dateStr, [m.end]: dateStr };
}

// ═══════════════════════════════════════
// ── Day lock (hash + khoá) ──
// ═══════════════════════════════════════

function isDayLocked(agentId, dateKey) {
  const db = getDb();
  return !!db.prepare('SELECT 1 FROM sync_day_locks WHERE agent_id = ? AND date_key = ?').get(agentId, dateKey);
}

function lockDay(agentId, dateKey, rowCounts) {
  const db = getDb();
  const hash = crypto.createHash('md5').update(JSON.stringify(rowCounts)).digest('hex');
  db.prepare(`
    INSERT OR REPLACE INTO sync_day_locks (agent_id, date_key, data_hash, row_counts, locked_at)
    VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
  `).run(agentId, dateKey, hash, JSON.stringify(rowCounts));
}

function getLockedDays(agentId) {
  const db = getDb();
  return db.prepare('SELECT date_key, data_hash, row_counts, locked_at FROM sync_day_locks WHERE agent_id = ? ORDER BY date_key').all(agentId);
}

function clearLocks(agentId) {
  const db = getDb();
  const r = db.prepare('DELETE FROM sync_day_locks WHERE agent_id = ?').run(agentId);
  return r.changes;
}

// ═══════════════════════════════════════
// ── Fetch with relogin + pagination ──
// ═══════════════════════════════════════

async function fetchWithRelogin(agent, ep, params) {
  try {
    return await fetchEndpointForAgent(agent, ep, params);
  } catch (err) {
    if (err.code === 'SESSION_EXPIRED') {
      log.warn(`[${agent.label}] phiên hết hạn — đăng nhập lại...`);
      const newAgent = await autoRelogin(agent);
      if (newAgent) {
        Object.assign(agent, { cookie: newAgent.cookie, user_agent: newAgent.user_agent });
        return await fetchEndpointForAgent(newAgent, ep, params);
      }
    }
    throw err;
  }
}

async function fetchAllPages(agent, ep, params) {
  const res1 = await fetchWithRelogin(agent, ep, { ...params, page: 1, limit: PAGE_SIZE });
  if (!res1 || res1.code !== 0) {
    throw new Error((res1 && res1.msg) || 'API code ' + (res1 ? res1.code : 'null'));
  }

  let allData = Array.isArray(res1.data) ? [...res1.data] : [];
  const totalCount = parseInt(res1.count) || allData.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (totalPages > 1 && allData.length > 0) {
    for (let page = 2; page <= totalPages; page++) {
      const resN = await fetchWithRelogin(agent, ep, { ...params, page, limit: PAGE_SIZE });
      if (resN && resN.code === 0 && Array.isArray(resN.data)) {
        allData = allData.concat(resN.data);
      }
    }
  }

  return { data: allData, totalData: res1.total_data || null, totalCount };
}

// ═══════════════════════════════════════
// ── Fetch 1 endpoint with retry ──
// ═══════════════════════════════════════

async function fetchWithRetry(agent, ep, params, maxRetries) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchAllPages(agent, ep, params);
    } catch (e) {
      lastErr = e;
      if (attempt < maxRetries) {
        log.warn(`[${agent.label}] ${ep} thử lại ${attempt + 1}/${maxRetries}`);
        await sleep(2000);
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
  const agent = db.prepare('SELECT * FROM ee88_agents WHERE id = ? AND status = 1').get(agentId);
  if (!agent) { agentSyncLocks.delete(agentId); return; }

  initProgress(agentId, agent.label);
  const startTime = Date.now();

  try {
    // ══════════════════════════════════
    // Phase 1: Non-date (members + invites) — song song
    // ══════════════════════════════════

    await Promise.allSettled(
      NON_DATE_EPS.map(async ep => {
        updateEp(agentId, ep, { status: 'syncing' });
        log.info(`[${agent.label}] đang thu thập ${epName(ep)}...`);
        try {
          const result = await fetchWithRetry(agent, ep, {}, MAX_RETRIES);
          if (result.data.length > 0) {
            dataStore.saveData(agent.id, ep, result.data, result.totalData);
          }
          updateEp(agentId, ep, { completed: 1, rows: result.data.length, status: 'done' });
        } catch (e) {
          updateEp(agentId, ep, { status: 'error' });
          clearSyncTree();
          log.error(`[${agent.label}] ${epName(ep)} lỗi: ${e.message}`);
        }
      })
    );

    // ══════════════════════════════════
    // Phase 2: Date endpoints — 65 ngày
    // ══════════════════════════════════
    const dates = [];
    for (let i = SYNC_DAYS; i >= 1; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      dates.push(fmtDate(d));
    }

    // Track per endpoint
    const epDayCount = {};
    const epRowCount = {};
    DATE_EPS.forEach(ep => { epDayCount[ep] = 0; epRowCount[ep] = 0; });
    DATE_EPS.forEach(ep => updateEp(agentId, ep, { status: 'syncing' }));

    for (let di = 0; di < dates.length; di++) {
      const dateStr = dates[di];

      // Ngày đã khoá → skip, cập nhật progress
      if (isDayLocked(agent.id, dateStr)) {
        DATE_EPS.forEach(ep => {
          epDayCount[ep]++;
          updateEp(agentId, ep, { completed: epDayCount[ep] });
        });
        continue;
      }

      // Fetch 8 endpoints song song cho ngày này
      const dayRowCounts = {};
      const dayResults = await Promise.allSettled(
        DATE_EPS.map(async ep => {
          const params = buildDateParams(ep, dateStr);
          try {
            const result = await fetchWithRetry(agent, ep, params, MAX_RETRIES);
            const dateKeyFull = dateStr + '|' + dateStr;

            if (result.data.length > 0) {
              dataStore.saveData(agent.id, ep, result.data, result.totalData, dateKeyFull);
            } else if (result.totalData) {
              dataStore.saveTotals(agent.id, ep, dateKeyFull, result.totalData);
            }

            dayRowCounts[ep] = result.data.length;
            return { ep, rows: result.data.length };
          } catch (e) {
            dayRowCounts[ep] = -1;
            throw e;
          }
        })
      );

      // Cập nhật progress cho từng EP
      const allOk = dayResults.every(r => r.status === 'fulfilled');
      DATE_EPS.forEach(ep => {
        epDayCount[ep]++;
        if (dayRowCounts[ep] >= 0) epRowCount[ep] += dayRowCounts[ep] || 0;
        updateEp(agentId, ep, { completed: epDayCount[ep], rows: epRowCount[ep] });
      });

      // Khoá ngày nếu tất cả OK
      if (allOk) {
        lockDay(agent.id, dateStr, dayRowCounts);
      } else {
        const errEps = dayResults.filter(r => r.status === 'rejected').map((r, i) => DATE_EPS[i]);
        clearSyncTree();
        log.error(`[${agent.label}] ngày ${dateStr} lỗi: ${errEps.join(', ')}`);
      }
    }

    // Mark done
    DATE_EPS.forEach(ep => updateEp(agentId, ep, { status: 'done' }));

    const sec = ((Date.now() - startTime) / 1000).toFixed(0);
    clearSyncTree();
    log.ok(`[${agent.label}] đồng bộ hoàn tất — ${sec}s`);

  } catch (e) {
    clearSyncTree();
    log.error(`[${agent.label}] đồng bộ lỗi: ${e.message}`);
    const p = syncProgress.get(agentId);
    if (p) { p.status = 'error'; emitProgress(); }
  } finally {
    agentSyncLocks.delete(agentId);
    const p = syncProgress.get(agentId);
    if (p && p.status === 'syncing') { p.status = 'done'; emitProgress(); }
    setTimeout(() => { syncProgress.delete(agentId); emitProgress(); }, 10000);
  }
}

// ═══════════════════════════════════════
// ── Sync all agents (tuần tự) ──
// ═══════════════════════════════════════

async function syncAllAgents() {
  const db = getDb();
  const agents = db.prepare('SELECT * FROM ee88_agents WHERE status = 1').all();
  if (agents.length === 0) { log.warn('Không có agent active'); return; }

  log.info(`Bắt đầu đồng bộ ${agents.length} đại lý`);
  for (const agent of agents) {
    if (!agentSyncLocks.get(agent.id)) {
      await syncAfterLogin(agent.id);
    }
  }
}

function isSyncRunning() { return agentSyncLocks.size > 0; }

module.exports = {
  syncAfterLogin,
  syncAllAgents,
  isSyncRunning,
  syncEmitter,
  getSyncProgressSnapshot,
  getLockedDays,
  clearLocks
};
