const pLimit = require('p-limit');
const { fetchEndpointForAgent } = require('./ee88Client');
const { autoRelogin } = require('./loginService');
const cacheManager = require('./cacheManager');
const dataStore = require('./dataStore');
const config = require('../config/default');
const { createLogger } = require('../utils/logger');

const log = createLogger('fanout');
const limit = pLimit(config.fanout.concurrency);

// ═══════════════════════════════════════
// ── Display Cache (in-memory) ──
// Cache response đã hiển thị → lần sau mở lại load ngay
// Tách biệt hoàn toàn với sync cache (cache_data table)
// ═══════════════════════════════════════

const displayCache = new Map(); // key → { allData, totalData, timestamp }
const refreshLocks = new Map(); // key → true (tránh refresh đồng thời)
const MAX_CACHE_SIZE = 100;
const CACHE_MAX_AGE = 30 * 60 * 1000; // 30 phút tối đa

/**
 * Tạo cache key từ agents + endpoint + params (trừ page/limit)
 */
function makeCacheKey(agentIds, endpointKey, params) {
  const ids = agentIds.slice().sort().join(',');
  const keys = Object.keys(params).filter(k => k !== 'page' && k !== 'limit').sort();
  const paramStr = keys.map(k => k + '=' + params[k]).join('&');
  return ids + ':' + endpointKey + ':' + paramStr;
}

/**
 * Dọn dẹp display cache — xoá entries quá cũ hoặc quá nhiều
 */
function evictStaleEntries() {
  const now = Date.now();
  for (const [k, v] of displayCache) {
    if (now - v.timestamp > CACHE_MAX_AGE) {
      displayCache.delete(k);
    }
  }
  while (displayCache.size > MAX_CACHE_SIZE) {
    const firstKey = displayCache.keys().next().value;
    displayCache.delete(firstKey);
  }
}

// ═══════════════════════════════════════
// ── Fetch helpers ──
// ═══════════════════════════════════════

/**
 * Gọi endpoint cho 1 agent, tự động re-login nếu session expired
 */
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

/**
 * Fetch full dataset cho tất cả agents (dùng sync cache cho ngày cũ, API cho còn lại)
 * Trả về { allData, totalData, successCount, errors }
 */
async function fetchAllData(agents, endpointKey, params) {
  const syncInfo = config.cache.enabled
    ? cacheManager.extractDateRange(endpointKey, params)
    : { cacheable: false };

  const fetchParams = { ...params, page: 1, limit: 500 };

  let allData = [];
  let totalData = null;
  let successCount = 0;
  let errors = [];

  const results = await Promise.allSettled(
    agents.map(agent =>
      limit(async () => {
        // Sync cache: chỉ cho ngày cũ (đã lock trong DB)
        if (syncInfo.cacheable) {
          const cached = cacheManager.getCache(agent.id, endpointKey, syncInfo.dateKey);
          if (cached) {
            log.info(`[${agent.label}] Sync cache HIT: ${endpointKey} ${syncInfo.dateKey} (${cached.rowCount} rows)`);
            return { agent, data: { code: 0, data: cached.data, total_data: cached.totalData, count: cached.rowCount } };
          }
        }

        // Gọi EE88 API
        const data = await fetchWithRelogin(agent, endpointKey, fetchParams);

        // Lưu vào sync cache (ngày cũ) + dataStore
        if (syncInfo.cacheable && Array.isArray(data.data)) {
          cacheManager.setCache(agent.id, endpointKey, syncInfo.dateKey, data.data, data.total_data, data.data.length);
        }
        try {
          if (Array.isArray(data.data) && data.data.length > 0) {
            dataStore.saveData(agent.id, endpointKey, data.data, data.total_data, syncInfo.dateKey || null);
          }
        } catch (e) { /* fail-safe */ }

        return { agent, data };
      })
    )
  );

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { agent, data } = r.value;
      successCount++;

      if (Array.isArray(data.data)) {
        data.data.forEach(row => {
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

/**
 * Background refresh — fetch mới + cập nhật display cache
 * Fire-and-forget, không block response
 */
function scheduleRefresh(agents, endpointKey, params, cacheKey) {
  if (refreshLocks.has(cacheKey)) return;
  refreshLocks.set(cacheKey, true);

  fetchAllData(agents, endpointKey, params)
    .then(result => {
      displayCache.set(cacheKey, {
        allData: result.allData,
        totalData: result.totalData,
        timestamp: Date.now(),
        fromLocal: false // data mới từ EE88
      });
      log.ok(`Display refresh OK: ${endpointKey} (${result.allData.length} rows)`);
    })
    .catch(err => {
      log.warn(`Display refresh failed: ${endpointKey}: ${err.message}`);
    })
    .finally(() => {
      refreshLocks.delete(cacheKey);
    });
}

// ═══════════════════════════════════════
// ── Local-first query (stale-while-revalidate) ──
// ═══════════════════════════════════════

/**
 * Query dữ liệu từ DB local (dataStore) cho tất cả agents
 * Trả ngay 0ms — dùng data đã sync/lưu trước đó
 * @returns {{ allData: Array, totalData: object|null } | null}
 */
function queryLocalData(agents, endpointKey, params) {
  try {
    const syncInfo = cacheManager.extractDateRange(endpointKey, params);
    const agentIds = agents.map(a => a.id);

    const result = dataStore.queryForDisplay(
      agentIds, endpointKey,
      syncInfo.startDate || null,
      syncInfo.endDate || null
    );

    if (!result || result.data.length === 0) return null;

    // Gắn agent label cho mỗi row
    const agentMap = {};
    agents.forEach(a => { agentMap[a.id] = a.label; });

    result.data.forEach(row => {
      row._agent_id = row.agent_id;
      row._agent_label = agentMap[row.agent_id] || 'Agent#' + row.agent_id;
    });

    return { allData: result.data, totalData: result.totalData };
  } catch (err) {
    log.warn(`queryLocalData [${endpointKey}] lỗi: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════════
// ── Fan-out fetch ──
// ═══════════════════════════════════════

/**
 * Fan-out: gọi N agents song song, gộp kết quả
 *
 * 2 tầng cache tách biệt:
 *   1. Display cache (in-memory) — lưu response vừa hiển thị, TTL 5 phút
 *   2. Sync cache (cache_data DB) — dữ liệu ngày cũ đã đồng bộ, lock vĩnh viễn
 *
 * @param {Array} agents — [{id, label, base_url, cookie}, ...]
 * @param {string} endpointKey — tên endpoint (vd: 'members')
 * @param {object} params — query params
 * @returns {object} — { code, msg, count, data[], total_data }
 */
async function fanoutFetch(agents, endpointKey, params) {
  if (agents.length === 0) {
    return { code: 0, msg: '', count: 0, data: [], total_data: null };
  }

  const clientPage = parseInt(params.page) || 1;
  const clientLimit = parseInt(params.limit) || 10;
  const staleTTL = config.cache.staleTTL || 300000;
  const agentIds = agents.map(a => a.id);
  const key = makeCacheKey(agentIds, endpointKey, params);

  // ── 1. Display cache — dữ liệu vừa hiển thị ──
  const cached = displayCache.get(key);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age > staleTTL) {
      // Stale — trả ngay + refresh nền
      log.info(`Display STALE: ${endpointKey} (${Math.round(age / 1000)}s) — bg refresh`);
      scheduleRefresh(agents, endpointKey, params, key);
    } else {
      log.info(`Display HIT: ${endpointKey} (${cached.allData.length} rows)`);
    }

    const offset = (clientPage - 1) * clientLimit;
    const resp = {
      code: 0, msg: '',
      count: cached.allData.length,
      data: cached.allData.slice(offset, offset + clientLimit),
      total_data: cached.totalData
    };
    if (cached.fromLocal) resp.fromLocal = true;
    return resp;
  }

  // ── 2. Local DB — dữ liệu đã sync, hiển thị ngay 0ms ──
  const localResult = queryLocalData(agents, endpointKey, params);
  if (localResult) {
    log.ok(`Display LOCAL: ${endpointKey} (${localResult.allData.length} rows từ DB) — bg refresh`);

    // Lưu vào displayCache để pagination dùng ngay
    displayCache.set(key, {
      allData: localResult.allData,
      totalData: localResult.totalData,
      timestamp: Date.now(),
      fromLocal: true // đánh dấu chưa refresh từ EE88
    });

    // Background: fetch dữ liệu mới từ EE88
    scheduleRefresh(agents, endpointKey, params, key);

    const offset = (clientPage - 1) * clientLimit;
    return {
      code: 0, msg: '',
      count: localResult.allData.length,
      data: localResult.allData.slice(offset, offset + clientLimit),
      total_data: localResult.totalData,
      fromLocal: true
    };
  }

  // ── 3. Display cache MISS + no local → blocking fetch từ EE88 ──
  const startTime = Date.now();
  log.info(`Display MISS: ${endpointKey} — no local data, fetching ${agents.length} agent(s)...`);

  const result = await fetchAllData(agents, endpointKey, params);

  // Lưu vào display cache
  displayCache.set(key, {
    allData: result.allData,
    totalData: result.totalData,
    timestamp: Date.now()
  });
  evictStaleEntries();

  const duration = Date.now() - startTime;
  log.ok(`Fetch [${endpointKey}] — ${duration}ms`, {
    tổngDòng: result.allData.length,
    thànhCông: result.successCount,
    thấtBại: result.errors.length
  });

  if (result.errors.length > 0) {
    log.warn(`Fetch [${endpointKey}] có ${result.errors.length} lỗi`, { errors: result.errors });
  }

  // Paginate và trả về
  const offset = (clientPage - 1) * clientLimit;
  return {
    code: result.successCount > 0 ? 0 : 1,
    msg: result.errors.length > 0 ? `${result.errors.length}/${agents.length} agent lỗi` : '',
    count: result.allData.length,
    data: result.allData.slice(offset, offset + clientLimit),
    total_data: result.totalData
  };
}

// ═══════════════════════════════════════
// ── Fan-out action ──
// ═══════════════════════════════════════

/**
 * Gửi action request tới 1 agent
 */
function sendAction(agent, actionPath, body) {
  const axios = require('axios');
  const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
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

/**
 * Fan-out action: gửi action đến 1 agent cụ thể, auto-relogin nếu cần
 * @param {object} agent — {id, label, base_url, cookie}
 * @param {string} actionPath — ee88 path (vd: '/agent/addUser')
 * @param {object} body — request body
 */
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
