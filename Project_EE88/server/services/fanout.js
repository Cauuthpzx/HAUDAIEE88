const axios = require('axios');
const pLimit = require('p-limit');
const { fetchEndpointForAgent } = require('./ee88Client');
const { autoRelogin } = require('./loginService');
const dataStore = require('./dataStore');
const config = require('../config/default');
const { createLogger } = require('../utils/logger');

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const log = createLogger('fanout');
const limit = pLimit(config.fanout.concurrency);

// ═══════════════════════════════════════
// ── SQLite-first refresh tracking ──
// ═══════════════════════════════════════

const refreshInProgress = new Map();
const lastRefreshAt = new Map();
const REFRESH_TTL = 5 * 60 * 1000; // 5 phút

function makeRefreshKey(agentIds, endpointKey) {
  return agentIds.slice().sort().join(',') + ':' + endpointKey;
}

// ═══════════════════════════════════════
// ── Fetch helpers ──
// ═══════════════════════════════════════

async function fetchWithRelogin(agent, endpointKey, params) {
  try {
    return await fetchEndpointForAgent(agent, endpointKey, params);
  } catch (err) {
    if (err.code === 'SESSION_EXPIRED') {
      log.warn(`[${agent.label}] Session expired — thử auto-login...`);
      const newAgent = await autoRelogin(agent);
      if (newAgent) {
        log.ok(`[${agent.label}] Re-login thành công, retry request...`);
        return await fetchEndpointForAgent(newAgent, endpointKey, params);
      }
    }
    throw err;
  }
}

// Report endpoints dùng param `date` với format "YYYY-MM-DD | YYYY-MM-DD"
const REPORT_EPS = new Set(['report-lottery', 'report-funds', 'report-third']);

/**
 * Normalize client params → đúng format EE88 API trước khi gửi.
 * - Report-*: chuyển date=X|Y thành date=X | Y (thêm spaces)
 * - Report-lottery: thêm lottery_id= nếu thiếu
 */
function normalizeApiParams(endpointKey, params) {
  const p = { ...params };
  if (REPORT_EPS.has(endpointKey) && p.date) {
    // Normalize: "2024-01-15|2024-01-15" → "2024-01-15 | 2024-01-15"
    const parts = p.date.split('|').map((s) => s.trim());
    if (parts.length === 2) {
      p.date = parts[0] + ' | ' + parts[1];
    }
    // Thêm username= và lottery_id= giống reference
    if (p.username === undefined) p.username = '';
    if (endpointKey === 'report-lottery' && p.lottery_id === undefined)
      p.lottery_id = '';
  }
  return p;
}

/**
 * Fetch full dataset cho tất cả agents — trực tiếp từ EE88 API
 */
async function fetchAllData(agents, endpointKey, params) {
  // Normalize params cho đúng format EE88 API
  const fetchParams = normalizeApiParams(endpointKey, {
    ...params,
    page: 1,
    limit: 500
  });

  // Extract dateKey từ params cho endpoints cần date_key
  const dateParam = params.create_time || params.bet_time || params.date;
  let dateKey = null;
  if (dateParam) {
    const parts = dateParam.split('|').map((s) => s.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      dateKey = parts[0] + '|' + parts[1];
    }
  }

  let allData = [];
  let totalData = null;
  let successCount = 0;
  let errors = [];

  const results = await Promise.allSettled(
    agents.map((agent) =>
      limit(async () => {
        const data = await fetchWithRelogin(agent, endpointKey, fetchParams);

        // Lưu vào dataStore (fail-safe)
        try {
          if (Array.isArray(data.data) && data.data.length > 0) {
            dataStore.saveData(
              agent.id,
              endpointKey,
              data.data,
              data.total_data,
              dateKey
            );
          }
        } catch (e) {
          /* fail-safe */
        }

        return { agent, data };
      })
    )
  );

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { agent, data } = r.value;
      successCount++;

      if (Array.isArray(data.data)) {
        data.data.forEach((row) => {
          row._agent_id = agent.id;
          row._agent_label = agent.label;
        });
        allData = allData.concat(data.data);
      }

      if (data.total_data) {
        if (!totalData) {
          totalData = { ...data.total_data };
        } else {
          for (const key in data.total_data) {
            const val = parseFloat(data.total_data[key]);
            if (!isNaN(val)) {
              totalData[key] = (parseFloat(totalData[key]) || 0) + val;
            }
          }
        }
      }
    } else {
      errors.push(r.reason?.message || 'Unknown error');
    }
  }

  return { allData, totalData, successCount, errors };
}

function scheduleRefresh(agents, endpointKey, params, refreshKey) {
  if (refreshInProgress.get(refreshKey)) return;
  refreshInProgress.set(refreshKey, true);

  fetchAllData(agents, endpointKey, params)
    .then((result) => {
      lastRefreshAt.set(refreshKey, Date.now());
      log.ok(`BG refresh OK: ${endpointKey} (${result.allData.length} rows)`);
    })
    .catch((err) => {
      log.warn(`BG refresh failed: ${endpointKey}: ${err.message}`);
    })
    .finally(() => {
      refreshInProgress.delete(refreshKey);
    });
}

/**
 * Kiểm tra date range có hoàn toàn trong quá khứ không (trước hôm nay)
 */
function isPastDateRange(params) {
  const dateParam = params.create_time || params.bet_time || params.date;
  if (!dateParam) return false;
  const parts = dateParam.split('|').map((s) => s.trim());
  if (parts.length !== 2 || !parts[1]) return false;
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return parts[1] < today;
}

// ═══════════════════════════════════════
// ── Fan-out fetch (SQLite-first) ──
// ═══════════════════════════════════════

async function fanoutFetch(agents, endpointKey, params) {
  if (agents.length === 0) {
    return { code: 0, msg: '', count: 0, data: [], total_data: null };
  }

  const agentIds = agents.map((a) => a.id);
  const refreshKey = makeRefreshKey(agentIds, endpointKey);

  // 1. SQLite-first — query local DB
  const localResult = dataStore.queryLocal(agentIds, endpointKey, params);

  if (localResult && localResult.data.length > 0) {
    // Ngày quá khứ = data đã chốt → trả ngay, không cần refresh
    const isPastDate = isPastDateRange(params);

    let fromLocal = false;
    if (!isPastDate) {
      const lastRefresh = lastRefreshAt.get(refreshKey);
      const isRefreshing = refreshInProgress.get(refreshKey);
      const isStale = !lastRefresh || Date.now() - lastRefresh > REFRESH_TTL;

      if (isStale && !isRefreshing) {
        scheduleRefresh(agents, endpointKey, params, refreshKey);
      }
      fromLocal = !!(isRefreshing || isStale);
    }

    log.info(
      `LOCAL ${isPastDate ? 'CACHED' : fromLocal ? 'STALE' : 'FRESH'}: ${endpointKey} (${localResult.count} total, page ${params.page || 1})`
    );

    return {
      code: 0,
      msg: '',
      count: localResult.count,
      data: localResult.data,
      total_data: localResult.totalData,
      fromLocal
    };
  }

  // 2. No local data → blocking fetch từ EE88
  const startTime = Date.now();
  log.info(
    `LOCAL MISS: ${endpointKey} — fetching ${agents.length} agent(s)...`
  );

  const result = await fetchAllData(agents, endpointKey, params);

  lastRefreshAt.set(refreshKey, Date.now());

  const duration = Date.now() - startTime;
  log.ok(`Fetch [${endpointKey}] — ${duration}ms`, {
    tổngDòng: result.allData.length,
    thànhCông: result.successCount,
    thấtBại: result.errors.length
  });

  // Server-side pagination cho blocking fetch
  const clientPage = parseInt(params.page) || 1;
  const clientLimit = parseInt(params.limit) || 10;
  const offset = (clientPage - 1) * clientLimit;

  return {
    code: result.successCount > 0 ? 0 : 1,
    msg:
      result.errors.length > 0
        ? `${result.errors.length}/${agents.length} agent lỗi`
        : '',
    count: result.allData.length,
    data: result.allData.slice(offset, offset + clientLimit),
    total_data: result.totalData
  };
}

// ═══════════════════════════════════════
// ── Fan-out action ──
// ═══════════════════════════════════════

function sendAction(agent, actionPath, body) {
  const client = axios.create({
    baseURL: agent.base_url,
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': agent.user_agent || DEFAULT_UA,
      Cookie: agent.cookie
    },
    timeout: 15000
  });
  const params = new URLSearchParams(body).toString();
  return client.post(actionPath, params);
}

async function fanoutAction(agent, actionPath, body) {
  let response = await sendAction(agent, actionPath, body);

  if (response.data && response.data.url === '/agent/login') {
    log.warn(`[${agent.label}] Action session expired — thử auto-login...`);
    const newAgent = await autoRelogin(agent);
    if (newAgent) {
      log.ok(`[${agent.label}] Re-login thành công, retry action...`);
      response = await sendAction(newAgent, actionPath, body);
      if (response.data && response.data.url === '/agent/login') {
        const err = new Error('Phiên EE88 đã hết hạn (sau re-login)');
        err.code = 'SESSION_EXPIRED';
        throw err;
      }
      return response.data;
    }

    const err = new Error('Phiên EE88 đã hết hạn');
    err.code = 'SESSION_EXPIRED';
    throw err;
  }

  return response.data;
}

module.exports = { fanoutFetch, fanoutAction };
