const cron = require('node-cron');
const pLimit = require('p-limit');
const { getDb } = require('../database/init');
const { fetchEndpointForAgent } = require('./ee88Client');
const { autoRelogin } = require('./loginService');
const cacheManager = require('./cacheManager');
const dataStore = require('./dataStore');
const config = require('../config/default');
const { createLogger } = require('../utils/logger');

const log = createLogger('cron-sync');
const limit = pLimit(config.fanout.concurrency);

let cronTask = null;
let isSyncing = false;
const agentSyncLocks = new Map(); // agentId → true (tránh sync đồng thời cùng agent)

const SYNC_DAYS = 65; // Số ngày lùi để sync sau login

/**
 * Fetch với auto-relogin (giống fanout.fetchWithRelogin)
 */
async function fetchWithRelogin(agent, endpointKey, params) {
  try {
    return await fetchEndpointForAgent(agent, endpointKey, params);
  } catch (err) {
    if (err.code === 'SESSION_EXPIRED') {
      log.warn(`[${agent.label}] Session expired — thử auto-login...`);
      const newAgent = await autoRelogin(agent);
      if (newAgent) {
        log.ok(`[${agent.label}] Re-login OK, retry...`);
        return await fetchEndpointForAgent(newAgent, endpointKey, params);
      }
    }
    throw err;
  }
}

/**
 * Sync 1 agent + 1 endpoint cho 1 ngày
 */
async function syncOne(agent, endpointKey, dateStr) {
  const dateKey = dateStr + '|' + dateStr;

  // Đã cache + locked → bỏ qua
  if (cacheManager.isCached(agent.id, endpointKey, dateKey)) {
    return { skipped: true };
  }

  cacheManager.logSync(agent.id, endpointKey, dateStr, 'syncing');

  try {
    const params = {
      ...cacheManager.buildDateParams(endpointKey, dateStr, dateStr),
      page: 1,
      limit: 500
    };

    const result = await fetchWithRelogin(agent, endpointKey, params);
    const data = Array.isArray(result.data) ? result.data : [];
    const rowCount = data.length;

    cacheManager.setCache(agent.id, endpointKey, dateKey, data, result.total_data, rowCount);
    // Chỉ lock ngày cũ — hôm nay giữ volatile để stale-while-revalidate
    if (dateStr < cacheManager.getToday()) {
      cacheManager.lockDate(agent.id, endpointKey, dateKey);
    }
    cacheManager.logSync(agent.id, endpointKey, dateStr, 'success', rowCount);

    // Phase 7: Lưu data thực vào SQLite
    try {
      if (data.length > 0) {
        dataStore.saveData(agent.id, endpointKey, data, result.total_data, dateKey);
      }
    } catch (e) { /* fail-safe */ }

    return { success: true, rowCount };
  } catch (err) {
    cacheManager.logSync(agent.id, endpointKey, dateStr, 'error', 0, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Chạy sync cho 1 ngày (tất cả agents × cacheable endpoints)
 */
async function runSync(dateStr, agentId, endpointKey) {
  if (isSyncing) {
    log.warn('Sync đang chạy, bỏ qua yêu cầu mới');
    return { skipped: true, reason: 'already_syncing' };
  }

  isSyncing = true;
  const startTime = Date.now();

  try {
    const db = getDb();
    let agents;
    if (agentId) {
      const agent = db.prepare('SELECT * FROM ee88_agents WHERE id = ? AND status = 1').get(agentId);
      agents = agent ? [agent] : [];
    } else {
      agents = db.prepare('SELECT * FROM ee88_agents WHERE status = 1').all();
    }

    const endpoints = endpointKey
      ? [endpointKey]
      : cacheManager.getCacheableEndpoints();

    const date = dateStr || cacheManager.getYesterday();

    log.info(`Bắt đầu sync: date=${date}, agents=${agents.length}, endpoints=${endpoints.length}`);

    let totalSuccess = 0;
    let totalError = 0;
    let totalSkipped = 0;
    let totalRows = 0;

    for (const agent of agents) {
      const tasks = endpoints.map(epKey =>
        limit(() => syncOne(agent, epKey, date))
      );

      const results = await Promise.allSettled(tasks);

      for (const r of results) {
        if (r.status === 'fulfilled') {
          const res = r.value;
          if (res.skipped) { totalSkipped++; }
          else if (res.success) { totalSuccess++; totalRows += res.rowCount || 0; }
          else { totalError++; }
        } else {
          totalError++;
        }
      }
    }

    // Lock tất cả cache cho ngày này
    cacheManager.lockAllForDate(date);

    const duration = Date.now() - startTime;
    log.ok(`Sync hoàn tất — ${duration}ms`, {
      date,
      thànhCông: totalSuccess,
      thấtBại: totalError,
      bỏQua: totalSkipped,
      tổngDòng: totalRows
    });

    return {
      success: true,
      date,
      stats: { success: totalSuccess, error: totalError, skipped: totalSkipped, rows: totalRows },
      duration
    };
  } finally {
    isSyncing = false;
  }
}

/**
 * Format Date → YYYY-MM-DD
 */
function fmtDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/**
 * Sync 65 ngày gần nhất cho 1 agent sau khi login thành công
 * - Chạy background (fire-and-forget), không block login response
 * - Endpoint có date → sync từng ngày, skip nếu đã cache
 * - Endpoint không có date (members, invites) → fetch 1 lần, lưu dataStore
 * - Khoá tất cả ngày trước hôm nay
 *
 * @param {number} agentId
 */
async function syncAfterLogin(agentId) {
  // Tránh sync đồng thời cho cùng 1 agent
  if (agentSyncLocks.get(agentId)) {
    log.warn(`[Agent #${agentId}] Post-login sync đang chạy, bỏ qua`);
    return;
  }
  agentSyncLocks.set(agentId, true);

  const startTime = Date.now();
  const db = getDb();
  const agent = db.prepare('SELECT * FROM ee88_agents WHERE id = ? AND status = 1').get(agentId);
  if (!agent) {
    agentSyncLocks.delete(agentId);
    return;
  }

  const today = cacheManager.getToday();
  const endpoints = cacheManager.getCacheableEndpoints();

  // Tạo danh sách 65 ngày (từ cũ → mới, bao gồm hôm nay để pre-warm volatile cache)
  const dates = [];
  for (let i = SYNC_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(fmtDate(d));
  }

  log.info(`[${agent.label}] Post-login sync bắt đầu: ${dates.length} ngày × ${endpoints.length} endpoints`);

  let totalSuccess = 0, totalSkipped = 0, totalError = 0, totalRows = 0;

  try {
    // ── 1. Sync date-based endpoints (từng ngày) ──
    for (const dateStr of dates) {
      const tasks = endpoints.map(epKey =>
        limit(() => syncOne(agent, epKey, dateStr))
      );
      const results = await Promise.allSettled(tasks);

      for (const r of results) {
        if (r.status === 'fulfilled') {
          if (r.value.skipped) totalSkipped++;
          else if (r.value.success) { totalSuccess++; totalRows += r.value.rowCount || 0; }
          else totalError++;
        } else {
          totalError++;
        }
      }

      // Khoá ngày này (trước hôm nay)
      if (dateStr < today) {
        cacheManager.lockAllForDate(dateStr);
      }
    }

    // ── 2. Sync non-date endpoints (members, invites) — fetch tất cả ──
    // Lưu cả cache_data (volatile) để SPA request đầu tiên được serve ngay
    const nonDateEndpoints = ['members', 'invites'];
    for (const ep of nonDateEndpoints) {
      try {
        const result = await fetchWithRelogin(agent, ep, { page: 1, limit: 500 });
        const data = Array.isArray(result.data) ? result.data : [];
        if (data.length > 0) {
          dataStore.saveData(agent.id, ep, data, result.total_data);
          cacheManager.setCache(agent.id, ep, '_all', data, result.total_data, data.length);
        }
        log.info(`[${agent.label}] Sync ${ep}: ${data.length} rows`);
      } catch (e) {
        log.warn(`[${agent.label}] Sync ${ep} lỗi: ${e.message}`);
      }
    }

    const duration = Date.now() - startTime;
    log.ok(`[${agent.label}] Post-login sync hoàn tất — ${duration}ms`, {
      thànhCông: totalSuccess, bỏQua: totalSkipped, thấtBại: totalError, tổngDòng: totalRows
    });
  } catch (err) {
    log.error(`[${agent.label}] Post-login sync lỗi: ${err.message}`);
  } finally {
    agentSyncLocks.delete(agentId);
  }
}

/**
 * Khởi động cron job
 */
function startCron() {
  if (!config.cache.enabled) {
    log.info('Cache đã tắt — cron không khởi động');
    return;
  }

  const schedule = config.cache.cronSchedule;
  log.info(`Khởi động cron sync: ${schedule}`);

  cronTask = cron.schedule(schedule, async () => {
    const yesterday = cacheManager.getYesterday();
    log.info(`Cron trigger — sync ngày ${yesterday}`);
    try {
      await runSync(yesterday);
    } catch (err) {
      log.error(`Cron sync thất bại: ${err.message}`);
    }
  });
}

/**
 * Dừng cron job
 */
function stopCron() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    log.info('Cron sync đã dừng');
  }
}

/**
 * Kiểm tra trạng thái syncing
 */
function isSyncRunning() {
  return isSyncing;
}

module.exports = { startCron, stopCron, runSync, syncAfterLogin, isSyncRunning };
