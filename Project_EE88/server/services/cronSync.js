/**
 * Sync Engine — đồng bộ dữ liệu EE88 vào SQLite
 *
 * Flow per agent — 3 phases (EE88 API chỉ hỗ trợ 1 pagination cùng lúc):
 *   Phase 1 (parallel): invites + 7 date endpoints × 65 ngày (~35s)
 *     → Tất cả single-page (no pagination) → chạy song song an toàn
 *   Phase 2 (solo): members (~20s, ~26 pages pagination)
 *     → Cần chạy riêng — concurrent requests gây lỗi pagination
 *   Phase 3 (solo): bet-orders (~5 min, ~24 pages × 10s/page)
 *     → API trả ALL 48K+ rows bất kể date, pagination cần chạy riêng
 *
 * Total ≈ 35s + 20s + 5 min ≈ 5.5 min (first run) / 5 min (subsequent)
 * Ngày đã khoá (hash) → bỏ qua; xong ngày → hash + lock
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
const MAX_RETRIES = 3;
const PAGE_SIZE = 2000; // 2000 rows/batch — tránh tích lũy memory
const BATCH_DELAY = 0; // benchmark: 0ms = 0% error, max throughput
const DAY_CONCURRENCY = 10; // 10 ngày song song trong date endpoint loop
const SYNC_TIMEOUT = 30 * 60 * 1000; // 30 phút timeout

// bet-orders moved here: API ignores date filter → returns ALL data regardless of date
// → sync 1 lần = ~21 pages (~2.5 min) thay vì 65 lần = ~1365 pages (~18 min)
const NON_DATE_EPS = ['members', 'invites', 'bet-orders'];
const DATE_EPS = [
  'deposits', 'withdrawals', 'lottery-bets',
  'lottery-bets-summary', 'report-lottery', 'report-funds', 'report-third'
];
const ALL_EPS = [...NON_DATE_EPS, ...DATE_EPS];

const DATE_PARAM_MAP = {
  deposits:               { start: 'start_time', end: 'end_time' },
  withdrawals:            { start: 'start_time', end: 'end_time' },
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
    endpoints[ep] = { name: epName(ep), total: 1, completed: 0, rows: 0, status: 'pending', currentPage: 0, totalPages: 0, error: null };
  });
  DATE_EPS.forEach(ep => {
    endpoints[ep] = { name: epName(ep), total: SYNC_DAYS, completed: 0, rows: 0, status: 'pending', currentPage: 0, totalPages: 0, error: null };
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
      const pageInfo = ep.totalPages > 1 ? CLR.yellow + ` p${ep.currentPage || 0}/${ep.totalPages}` + CLR.reset : '';
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
        Object.assign(agent, { cookie: newAgent.cookie, user_agent: newAgent.user_agent });
        return await fetchEndpointForAgent(newAgent, ep, params);
      }
    }
    throw err;
  }
}

// ═══════════════════════════════════════
// ── Fetch + Save theo batch (không tích lũy memory) ──
// ═══════════════════════════════════════

/**
 * Fetch tất cả trang + save từng batch vào DB ngay lập tức.
 * Không giữ data trong memory — tránh OOM khi endpoint có nhiều row (50K+).
 *
 * @param {object} agent
 * @param {string} ep — endpoint key
 * @param {object} params — query params
 * @param {string|null} dateKey — date key cho date endpoints
 * @returns {{ totalRows, totalData }}
 */
async function fetchAndSaveBatches(agent, ep, params, dateKey, onPage) {
  let lastErr;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      let totalRows = 0;

      // Page 1
      const res1 = await fetchWithRelogin(agent, ep, { ...params, page: 1, limit: PAGE_SIZE });
      if (!res1 || res1.code !== 0) {
        throw new Error((res1 && res1.msg) || 'API code ' + (res1 ? res1.code : 'null'));
      }

      // Rate-limit detection: API trả data="" (string) thay vì array khi bị throttle
      if (!Array.isArray(res1.data)) {
        throw Object.assign(new Error('API rate-limited (data is string)'), { isRateLimit: true });
      }

      const totalData = res1.total_data || null;
      const firstBatch = res1.data;
      const totalCount = parseInt(res1.count) || firstBatch.length;
      const totalPages = Math.ceil(totalCount / PAGE_SIZE);

      // Save batch 1 ngay
      if (firstBatch.length > 0) {
        dataStore.saveData(agent.id, ep, firstBatch, null, dateKey);
        totalRows += firstBatch.length;
      }

      // Page progress callback
      if (onPage) onPage({ page: 1, totalPages, rows: totalRows });

      // Remaining pages — fetch + save + free memory mỗi batch
      // Early-stop: break khi page trống hoặc < PAGE_SIZE (tránh fetch thừa khi count sai)
      for (let page = 2; page <= totalPages; page++) {
        if (BATCH_DELAY > 0) await sleep(BATCH_DELAY);
        const resN = await fetchWithRelogin(agent, ep, { ...params, page, limit: PAGE_SIZE });
        if (resN && resN.code === 0 && Array.isArray(resN.data) && resN.data.length > 0) {
          dataStore.saveData(agent.id, ep, resN.data, null, dateKey);
          totalRows += resN.data.length;
          if (onPage) onPage({ page, totalPages, rows: totalRows });
          if (resN.data.length < PAGE_SIZE) break; // Last page
        } else {
          break; // Empty page — no more data
        }
      }

      // Save totals nếu có
      if (totalData && dateKey) {
        dataStore.saveTotals(agent.id, ep, dateKey, totalData);
      }

      return { totalRows, totalData };

    } catch (e) {
      lastErr = e;
      if (attempt < MAX_RETRIES) {
        // Rate-limited: đợi lâu hơn (15s) để API cooldown
        const delay = e.isRateLimit ? 15000 : 2000;
        log.warn(`[${agent.label}] ${ep} thử lại ${attempt + 1}/${MAX_RETRIES}${e.isRateLimit ? ' (rate-limited, đợi 15s)' : ''}`);
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
  const agent = db.prepare('SELECT * FROM ee88_agents WHERE id = ? AND status = 1').get(agentId);
  if (!agent) { agentSyncLocks.delete(agentId); return; }

  initProgress(agentId, agent.label);
  const startTime = Date.now();

  // Timeout guard — tự huỷ nếu sync quá lâu
  let syncAborted = false;
  const timeoutId = setTimeout(() => {
    syncAborted = true;
    log.error(`[${agent.label}] TIMEOUT — sync quá ${SYNC_TIMEOUT / 60000} phút, huỷ bỏ`);
  }, SYNC_TIMEOUT);

  try {
    // ══════════════════════════════════════════════════════
    // 3 phases tuần tự — EE88 API chỉ hỗ trợ 1 pagination/session:
    //   Phase 1 (parallel): invites + date endpoints (~35s, all single-page)
    //   Phase 2 (solo): members (~20s, multi-page pagination)
    //   Phase 3 (solo): bet-orders (~5 min, multi-page pagination)
    //
    // Concurrent requests gây lỗi pagination (page 2+ trả empty 71ms).
    // Endpoints single-page (date) chạy song song an toàn.
    // Endpoints multi-page (members, bet-orders) PHẢI chạy riêng.
    // ══════════════════════════════════════════════════════

    const today = fmtDate(new Date());

    // ── Phase 1: invites + date endpoints (parallel — all single-page) ──
    log.info(`[${agent.label}] Phase 1: invites + date endpoints...`);

    // invites (single page)
    const invitePromise = (async () => {
      updateEp(agentId, 'invites', { status: 'syncing' });
      try {
        const result = await fetchAndSaveBatches(agent, 'invites', {}, null, (info) => {
          updateEp(agentId, 'invites', { currentPage: info.page, totalPages: info.totalPages, rows: info.rows });
        });
        updateEp(agentId, 'invites', { completed: 1, rows: result.totalRows, status: 'done' });
      } catch (e) {
        updateEp(agentId, 'invites', { status: 'error', error: e.message });
        clearSyncTree();
        log.error(`[${agent.label}] ${epName('invites')} lỗi: ${e.message}`);
      }
    })();

    // date endpoints (65 ngày × 7 eps, 10 ngày song song)
    const datePromise = (async () => {
      const dates = [];
      for (let i = SYNC_DAYS; i >= 1; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        dates.push(fmtDate(d));
      }

      const epDayCount = {};
      const epRowCount = {};
      DATE_EPS.forEach(ep => { epDayCount[ep] = 0; epRowCount[ep] = 0; });
      DATE_EPS.forEach(ep => updateEp(agentId, ep, { status: 'syncing' }));

      for (let di = 0; di < dates.length; di += DAY_CONCURRENCY) {
        if (syncAborted) {
          log.warn(`[${agent.label}] sync bị huỷ do timeout`);
          break;
        }

        const dayBatch = dates.slice(di, di + DAY_CONCURRENCY);

        await Promise.allSettled(dayBatch.map(async (dateStr) => {
          if (syncAborted) return;

          if (isDayLocked(agent.id, dateStr)) {
            DATE_EPS.forEach(ep => {
              epDayCount[ep]++;
              updateEp(agentId, ep, { completed: epDayCount[ep] });
            });
            return;
          }

          const dayRowCounts = {};
          const dateKeyFull = dateStr + '|' + dateStr;
          const dayResults = await Promise.allSettled(
            DATE_EPS.map(async ep => {
              const params = buildDateParams(ep, dateStr);
              try {
                const result = await fetchAndSaveBatches(agent, ep, params, dateKeyFull);
                dayRowCounts[ep] = result.totalRows;
                return { ep, rows: result.totalRows };
              } catch (e) {
                dayRowCounts[ep] = -1;
                throw e;
              }
            })
          );

          const allOk = dayResults.every(r => r.status === 'fulfilled');
          DATE_EPS.forEach(ep => {
            epDayCount[ep]++;
            if (dayRowCounts[ep] >= 0) epRowCount[ep] += dayRowCounts[ep] || 0;
            updateEp(agentId, ep, { completed: epDayCount[ep], rows: epRowCount[ep] });
          });

          if (allOk) {
            lockDay(agent.id, dateStr, dayRowCounts);
          } else {
            const errEps = dayResults.filter(r => r.status === 'rejected').map((r, i) => DATE_EPS[i]);
            clearSyncTree();
            log.error(`[${agent.label}] ngày ${dateStr} lỗi: ${errEps.join(', ')}`);
          }
        }));
      }

      DATE_EPS.forEach(ep => updateEp(agentId, ep, { status: 'done' }));
    })();

    await Promise.allSettled([invitePromise, datePromise]);
    const p1sec = ((Date.now() - startTime) / 1000).toFixed(0);
    log.info(`[${agent.label}] Phase 1 xong — ${p1sec}s`);

    // ── Phase 2: members (solo — multi-page pagination) ──
    if (!syncAborted) {
      updateEp(agentId, 'members', { status: 'syncing' });
      log.info(`[${agent.label}] Phase 2: members (solo pagination)...`);
      try {
        const result = await fetchAndSaveBatches(agent, 'members', {}, null, (info) => {
          updateEp(agentId, 'members', { currentPage: info.page, totalPages: info.totalPages, rows: info.rows });
        });
        updateEp(agentId, 'members', { completed: 1, rows: result.totalRows, status: 'done' });
      } catch (e) {
        updateEp(agentId, 'members', { status: 'error', error: e.message });
        clearSyncTree();
        log.error(`[${agent.label}] ${epName('members')} lỗi: ${e.message}`);
      }
      log.info(`[${agent.label}] Phase 2 xong — ${((Date.now() - startTime) / 1000).toFixed(0)}s`);
    }

    // ── Phase 3: bet-orders (solo — multi-page pagination, ~5 min) ──
    if (!syncAborted) {
      updateEp(agentId, 'bet-orders', { status: 'syncing' });
      log.info(`[${agent.label}] Phase 3: bet-orders (solo pagination)...`);
      try {
        const params = { start_time: today, end_time: today };
        const result = await fetchAndSaveBatches(agent, 'bet-orders', params, null, (info) => {
          updateEp(agentId, 'bet-orders', { currentPage: info.page, totalPages: info.totalPages, rows: info.rows });
        });
        updateEp(agentId, 'bet-orders', { completed: 1, rows: result.totalRows, status: 'done' });
      } catch (e) {
        updateEp(agentId, 'bet-orders', { status: 'error', error: e.message });
        clearSyncTree();
        log.error(`[${agent.label}] ${epName('bet-orders')} lỗi: ${e.message}`);
      }
    }

    const sec = ((Date.now() - startTime) / 1000).toFixed(0);
    clearSyncTree();
    log.ok(`[${agent.label}] đồng bộ hoàn tất — ${sec}s`);

  } catch (e) {
    clearSyncTree();
    log.error(`[${agent.label}] đồng bộ lỗi: ${e.message}`);
    const p = syncProgress.get(agentId);
    if (p) { p.status = 'error'; emitProgress(); }
  } finally {
    clearTimeout(timeoutId);
    agentSyncLocks.delete(agentId);
    const p = syncProgress.get(agentId);
    if (p && p.status === 'syncing') {
      p.status = syncAborted ? 'error' : 'done';
      emitProgress();
    }
    // Giữ progress data 60s để client kịp thấy kết quả/lỗi
    setTimeout(() => { syncProgress.delete(agentId); emitProgress(); }, 60000);
  }
}

// ═══════════════════════════════════════
// ── Sync all agents (song song — benchmark: 2.6x nhanh hơn, 0% error) ──
// ═══════════════════════════════════════

async function syncAllAgents() {
  const db = getDb();
  const agents = db.prepare('SELECT * FROM ee88_agents WHERE status = 1').all();
  if (agents.length === 0) { log.warn('Không có agent active'); return; }

  log.info(`Bắt đầu đồng bộ ${agents.length} đại lý (song song)`);
  await Promise.allSettled(
    agents.filter(a => !agentSyncLocks.get(a.id))
      .map(a => syncAfterLogin(a.id))
  );
}

function isSyncRunning() { return agentSyncLocks.size > 0; }
function isAgentSyncing(agentId) { return !!agentSyncLocks.get(agentId); }

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
