const cron = require('node-cron');
const { getDb } = require('../database/init');
const { fetchEndpointForAgent } = require('./ee88Client');
const { autoRelogin } = require('./loginService');
const cacheManager = require('./cacheManager');
const dataStore = require('./dataStore');
const config = require('../config/default');
const { createLogger } = require('../utils/logger');

const log = createLogger('sync');

let cronTask = null;
let isSyncing = false;
const agentSyncLocks = new Map();

const SYNC_DAYS = 65;
const MAX_RETRIES = 2;
const PAGE_SIZE = 500;

// ═══════════════════════════════════════
// ── Adaptive Speed (slow-start) ──
// ═══════════════════════════════════════

const SPEED = {
  initialDelay: 2000,
  minDelay: 300,
  maxDelay: 8000,
  speedUp: 0.8,
  slowDown: 2.5,
};

function createSpeedCtrl() {
  let delay = SPEED.initialDelay;
  let streak = 0;
  return {
    get delay() { return delay; },
    onSuccess() { streak = Math.max(0, streak) + 1; delay = Math.max(SPEED.minDelay, Math.floor(delay * SPEED.speedUp)); },
    onError()   { streak = Math.min(0, streak) - 1; delay = Math.min(SPEED.maxDelay, Math.floor(delay * SPEED.slowDown)); },
    onSkip()    { },
    label()     { return delay <= 500 ? 'nhanh' : delay <= 1500 ? 'vừa' : 'chậm'; }
  };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══════════════════════════════════════
// ── Fetch with relogin ──
// ═══════════════════════════════════════

async function fetchWithRelogin(agent, endpointKey, params) {
  try {
    return await fetchEndpointForAgent(agent, endpointKey, params);
  } catch (err) {
    if (err.code === 'SESSION_EXPIRED') {
      log.warn(`${agent.label} session expired — re-login...`);
      const newAgent = await autoRelogin(agent);
      if (newAgent) {
        log.ok(`${agent.label} re-login OK`);
        return await fetchEndpointForAgent(newAgent, endpointKey, params);
      }
    }
    throw err;
  }
}

// ═══════════════════════════════════════
// ── Validate + Paginate ──
// ═══════════════════════════════════════

/**
 * Fetch toàn bộ data cho 1 endpoint (tự động phân trang nếu >500 rows)
 * Validate response code, kiểm tra thiếu dữ liệu
 *
 * @returns {{ data: Array, totalData: object|null, totalCount: number, pages: number }}
 */
async function fetchAllPages(agent, endpointKey, params) {
  // Page 1
  const res1 = await fetchWithRelogin(agent, endpointKey, { ...params, page: 1, limit: PAGE_SIZE });

  // Validate response
  if (!res1 || res1.code !== 0) {
    const msg = (res1 && res1.msg) ? res1.msg : 'API trả code ' + (res1 ? res1.code : 'null');
    throw new Error(msg);
  }

  let allData = Array.isArray(res1.data) ? [...res1.data] : [];
  const totalCount = parseInt(res1.count) || allData.length;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Fetch remaining pages nếu có
  if (totalPages > 1 && allData.length > 0) {
    log.info(`${agent.label} ${endpointKey} — ${totalCount} rows → ${totalPages} pages`);

    for (let page = 2; page <= totalPages; page++) {
      const resN = await fetchWithRelogin(agent, endpointKey, { ...params, page, limit: PAGE_SIZE });

      if (resN && resN.code === 0 && Array.isArray(resN.data)) {
        allData = allData.concat(resN.data);
      } else {
        log.warn(`${agent.label} ${endpointKey} page ${page}/${totalPages} — lỗi hoặc rỗng`);
      }
    }
  }

  // Kiểm tra thiếu dữ liệu
  if (totalCount > 0 && allData.length < totalCount) {
    log.warn(`${agent.label} ${endpointKey} — thiếu: nhận ${allData.length}/${totalCount} rows`);
  }

  return { data: allData, totalData: res1.total_data || null, totalCount, pages: totalPages };
}

// ═══════════════════════════════════════
// ── Sync 1 endpoint × 1 ngày (với retry) ──
// ═══════════════════════════════════════

async function syncOne(agent, endpointKey, dateStr) {
  const dateKey = dateStr + '|' + dateStr;

  if (cacheManager.isCached(agent.id, endpointKey, dateKey)) {
    return { skipped: true };
  }

  cacheManager.logSync(agent.id, endpointKey, dateStr, 'syncing');

  const params = cacheManager.buildDateParams(endpointKey, dateStr, dateStr);
  const result = await fetchAllPages(agent, endpointKey, params);

  // Lưu cache + lock
  cacheManager.setCache(agent.id, endpointKey, dateKey, result.data, result.totalData, result.data.length);
  cacheManager.lockDate(agent.id, endpointKey, dateKey);
  cacheManager.logSync(agent.id, endpointKey, dateStr, 'success', result.data.length);

  // Lưu data thực vào SQLite
  try {
    if (result.data.length > 0) {
      dataStore.saveData(agent.id, endpointKey, result.data, result.totalData, dateKey);
    }
  } catch (e) { /* fail-safe */ }

  return {
    success: true,
    rowCount: result.data.length,
    totalCount: result.totalCount,
    pages: result.pages,
    verified: result.data.length >= result.totalCount
  };
}

/**
 * Sync 1 endpoint × 1 ngày — có retry
 */
async function syncOneWithRetry(agent, endpointKey, dateStr, speed) {
  let lastError = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const r = await syncOne(agent, endpointKey, dateStr);

      if (r.skipped) {
        speed.onSkip();
        return r;
      }

      // Thành công
      speed.onSuccess();
      await sleep(speed.delay);

      // Cảnh báo nếu thiếu data
      if (!r.verified) {
        log.warn(`${agent.label} ${endpointKey} ${dateStr} — nhận ${r.rowCount}/${r.totalCount} (thiếu!)`);
      }

      return r;
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES) {
        log.warn(`${agent.label} ${endpointKey} ${dateStr} — lỗi, retry ${attempt + 1}/${MAX_RETRIES}: ${e.message}`);
        speed.onError();
        await sleep(speed.delay);
      }
    }
  }

  // Hết retry
  speed.onError();
  cacheManager.logSync(agent.id, endpointKey, dateStr, 'error', 0, lastError.message);
  log.error(`${agent.label} ${endpointKey} ${dateStr} — thất bại sau ${MAX_RETRIES + 1} lần: ${lastError.message}`);
  await sleep(speed.delay);

  return { success: false, error: lastError.message };
}

// ═══════════════════════════════════════
// ── Post-login sync (65 ngày, 1 agent) ──
// ═══════════════════════════════════════

function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function syncAfterLogin(agentId) {
  if (agentSyncLocks.get(agentId)) {
    log.warn(`Agent #${agentId} sync đang chạy, bỏ qua`);
    return;
  }
  agentSyncLocks.set(agentId, true);

  const db = getDb();
  const agent = db.prepare('SELECT * FROM ee88_agents WHERE id = ? AND status = 1').get(agentId);
  if (!agent) { agentSyncLocks.delete(agentId); return; }

  const today = cacheManager.getToday();
  const endpoints = cacheManager.getCacheableEndpoints();
  const speed = createSpeedCtrl();

  const dates = [];
  for (let i = SYNC_DAYS - 1; i >= 1; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    dates.push(fmtDate(d));
  }

  const totalTasks = dates.length * endpoints.length;
  let ok = 0, err = 0, skip = 0, rows = 0, incomplete = 0;
  const startTime = Date.now();

  log.info(`${agent.label} ── sync: ${dates.length} ngày × ${endpoints.length} EP = ${totalTasks} tác vụ`);

  try {
    // ── Date-based endpoints: tuần tự, adaptive, retry ──
    for (let di = 0; di < dates.length; di++) {
      const dateStr = dates[di];
      let dayOk = 0, dayErr = 0, daySkip = 0, dayRows = 0;

      for (const epKey of endpoints) {
        const r = await syncOneWithRetry(agent, epKey, dateStr, speed);

        if (r.skipped) {
          skip++; daySkip++;
        } else if (r.success) {
          ok++; dayOk++;
          rows += r.rowCount || 0;
          dayRows += r.rowCount || 0;
          if (!r.verified) incomplete++;
        } else {
          err++; dayErr++;
        }
      }

      // Log mỗi ngày (chỉ khi có sync thực)
      if (dayOk > 0 || dayErr > 0) {
        const left = dates.length - di - 1;
        log.info(`${agent.label} ${dateStr} ✓${dayOk} ✗${dayErr} ⊘${daySkip} ${dayRows}r | còn ${left} ngày [${speed.label()}]`);
      }

      if (dateStr < today) cacheManager.lockAllForDate(dateStr);
    }

    // ── Non-date endpoints ──
    const nonDate = ['members', 'invites'];
    for (const ep of nonDate) {
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        try {
          const result = await fetchAllPages(agent, ep, {});
          if (result.data.length > 0) dataStore.saveData(agent.id, ep, result.data, result.totalData);
          log.ok(`${agent.label} ${ep} — ${result.data.length}r (${result.pages} page)`);
          await sleep(speed.delay);
          break;
        } catch (e) {
          if (attempt < MAX_RETRIES) {
            log.warn(`${agent.label} ${ep} — retry ${attempt + 1}/${MAX_RETRIES}: ${e.message}`);
            await sleep(speed.delay * 2);
          } else {
            log.error(`${agent.label} ${ep} — thất bại: ${e.message}`);
          }
        }
      }
    }

    // ── Summary ──
    const sec = ((Date.now() - startTime) / 1000).toFixed(0);
    const pct = totalTasks > 0 ? Math.round((ok + skip) / totalTasks * 100) : 100;
    let summary = `${agent.label} ── sync xong: ${sec}s | ✓${ok} ✗${err} ⊘${skip} ${rows}r (${pct}%)`;
    if (incomplete > 0) summary += ` | ⚠ ${incomplete} thiếu dữ liệu`;
    if (err > 0) summary += ` | ${err} lỗi cần kiểm tra`;
    log.ok(summary);

  } catch (e) {
    log.error(`${agent.label} sync lỗi: ${e.message}`);
  } finally {
    agentSyncLocks.delete(agentId);
  }
}

// ═══════════════════════════════════════
// ── Daily sync (cron) ──
// ═══════════════════════════════════════

async function runSync(dateStr, agentId, endpointKey) {
  if (isSyncing) { log.warn('Sync đang chạy, bỏ qua'); return { skipped: true }; }
  isSyncing = true;
  const startTime = Date.now();
  const speed = createSpeedCtrl();

  try {
    const db = getDb();
    const agents = agentId
      ? [db.prepare('SELECT * FROM ee88_agents WHERE id = ? AND status = 1').get(agentId)].filter(Boolean)
      : db.prepare('SELECT * FROM ee88_agents WHERE status = 1').all();
    const eps = endpointKey ? [endpointKey] : cacheManager.getCacheableEndpoints();
    const date = dateStr || cacheManager.getYesterday();

    log.info(`── SYNC ${date} | ${agents.length} agent × ${eps.length} EP ──`);

    let ok = 0, err = 0, skip = 0, rows = 0, incomplete = 0;

    for (const agent of agents) {
      for (const epKey of eps) {
        const r = await syncOneWithRetry(agent, epKey, date, speed);
        if (r.skipped) skip++;
        else if (r.success) { ok++; rows += r.rowCount || 0; if (!r.verified) incomplete++; }
        else err++;
      }
      log.info(`${agent.label} ${date} xong: ✓${ok} ✗${err} ⊘${skip}`);
    }

    cacheManager.lockAllForDate(date);
    const sec = ((Date.now() - startTime) / 1000).toFixed(0);
    let summary = `── SYNC ${date} xong: ${sec}s | ✓${ok} ✗${err} ⊘${skip} ${rows}r ──`;
    if (incomplete > 0) summary += ` | ⚠ ${incomplete} thiếu`;
    log.ok(summary);

    return { success: true, date, stats: { success: ok, error: err, skipped: skip, rows, incomplete }, duration: Date.now() - startTime };
  } finally {
    isSyncing = false;
  }
}

// ═══════════════════════════════════════
// ── Sync all agents ──
// ═══════════════════════════════════════

async function syncAllAgents() {
  const db = getDb();
  const agents = db.prepare('SELECT * FROM ee88_agents WHERE status = 1').all();
  if (agents.length === 0) { log.warn('Không có agent active'); return { success: 0, fail: 0, skipped: 0 }; }

  log.info(`══ SYNC ALL: ${agents.length} agents × ${SYNC_DAYS} ngày ══`);
  const startTime = Date.now();
  let success = 0, fail = 0, skipped = 0;

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const left = agents.length - i - 1;

    if (agentSyncLocks.get(agent.id)) {
      log.warn(`[${i + 1}/${agents.length}] ${agent.label} đang sync, bỏ qua (còn ${left})`);
      skipped++; continue;
    }

    log.info(`[${i + 1}/${agents.length}] ${agent.label} bắt đầu (còn ${left})`);
    try { await syncAfterLogin(agent.id); success++; }
    catch (e) { log.error(`${agent.label} thất bại: ${e.message}`); fail++; }
  }

  const sec = ((Date.now() - startTime) / 1000).toFixed(0);
  log.ok(`══ SYNC ALL xong: ${sec}s | ✓${success} ✗${fail} ⊘${skipped} ══`);
  return { success, fail, skipped, duration: Date.now() - startTime };
}

// ═══════════════════════════════════════
// ── Cron ──
// ═══════════════════════════════════════

function startCron() {
  if (!config.cache.enabled) { log.info('Cache tắt — không khởi động cron'); return; }
  const schedule = config.cache.cronSchedule;
  log.info(`Cron sync: ${schedule}`);
  cronTask = cron.schedule(schedule, async () => {
    const yesterday = cacheManager.getYesterday();
    log.info(`Cron trigger — ${yesterday}`);
    try { await runSync(yesterday); }
    catch (e) { log.error(`Cron lỗi: ${e.message}`); }
  });
}

function stopCron() { if (cronTask) { cronTask.stop(); cronTask = null; } }
function isSyncRunning() { return isSyncing; }

module.exports = { startCron, stopCron, runSync, syncAfterLogin, syncAllAgents, isSyncRunning };
