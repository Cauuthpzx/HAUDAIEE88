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
// ── Background refresh (stale-while-revalidate) ──
// ═══════════════════════════════════════

const refreshLocks = new Map(); // "agentId:endpoint:dateKey" → true

/**
 * Background refresh — fetch mới từ EE88 API và cập nhật cache + dataStore
 * Chạy fire-and-forget, không block response
 */
function backgroundRefresh(agent, endpointKey, params, dateKey) {
  const key = `${agent.id}:${endpointKey}:${dateKey}`;
  if (refreshLocks.has(key)) return; // Đang refresh rồi

  refreshLocks.set(key, true);

  (async () => {
    try {
      log.info(`[${agent.label}] BG refresh: ${endpointKey} ${dateKey}`);
      const result = await fetchWithRelogin(agent, endpointKey, params);

      if (Array.isArray(result.data)) {
        cacheManager.setCache(agent.id, endpointKey, dateKey, result.data, result.total_data, result.data.length);
        try {
          if (result.data.length > 0) {
            dataStore.saveData(agent.id, endpointKey, result.data, result.total_data, dateKey);
          }
        } catch (e) { /* fail-safe */ }
      }
      log.ok(`[${agent.label}] BG refresh OK: ${endpointKey} ${dateKey} (${result.data?.length || 0} rows)`);
    } catch (err) {
      log.warn(`[${agent.label}] BG refresh failed: ${endpointKey}: ${err.message}`);
    } finally {
      refreshLocks.delete(key);
    }
  })();
}

// ═══════════════════════════════════════
// ── Fetch with auto-relogin ──
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

// ═══════════════════════════════════════
// ── Cache helpers ──
// ═══════════════════════════════════════

/**
 * Thử serve từ cache, trả về data hoặc null
 * Nếu cache stale → trigger background refresh
 */
function tryCacheHit(agent, endpointKey, cacheInfo, staleTTL, fetchParams) {
  if (!cacheInfo.cacheable) return null;

  const cached = cacheManager.getCacheWithFreshness(agent.id, endpointKey, cacheInfo.dateKey, staleTTL);
  if (!cached) return null;

  if (cached.locked || !cached.isStale) {
    log.info(`[${agent.label}] Cache HIT (${cached.locked ? 'locked' : 'fresh'}): ${endpointKey} ${cacheInfo.dateKey} (${cached.rowCount} rows)`);
  } else {
    log.info(`[${agent.label}] Cache STALE: ${endpointKey} ${cacheInfo.dateKey} (${Math.round(cached.ageMs / 1000)}s) — bg refresh`);
    backgroundRefresh(agent, endpointKey, fetchParams, cacheInfo.dateKey);
  }

  return cached;
}

/**
 * Lưu kết quả vào cache + dataStore
 */
function saveResults(agentId, endpointKey, cacheInfo, data, totalData) {
  if (cacheInfo.cacheable && Array.isArray(data)) {
    cacheManager.setCache(agentId, endpointKey, cacheInfo.dateKey, data, totalData, data.length);
  }
  try {
    if (Array.isArray(data) && data.length > 0) {
      dataStore.saveData(agentId, endpointKey, data, totalData, cacheInfo.dateKey || null);
    }
  } catch (e) { /* fail-safe */ }
}

// ═══════════════════════════════════════
// ── Fan-out fetch ──
// ═══════════════════════════════════════

/**
 * Fan-out: gọi N agents song song, gộp kết quả
 * Stale-while-revalidate: serve cache ngay, refresh nền nếu stale
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

  const cacheInfo = config.cache.enabled
    ? cacheManager.extractDateRange(endpointKey, params)
    : { cacheable: false, volatile: false };

  const staleTTL = config.cache.staleTTL || 300000;
  const clientPage = parseInt(params.page) || 1;
  const clientLimit = parseInt(params.limit) || 10;

  // ── Single agent ──
  if (agents.length === 1) {
    const agent = agents[0];

    // Volatile requests: luôn fetch full dataset để cache + paginate server-side
    const fetchParams = cacheInfo.volatile
      ? { ...params, page: 1, limit: 500 }
      : params;

    // 1. Thử cache
    const cached = tryCacheHit(agent, endpointKey, cacheInfo, staleTTL, fetchParams);
    if (cached) {
      const data = Array.isArray(cached.data) ? cached.data : [];
      data.forEach(row => { row._agent_id = agent.id; row._agent_label = agent.label; });

      // Volatile cache: paginate server-side (full dataset cached)
      if (cacheInfo.volatile && data.length > clientLimit) {
        const offset = (clientPage - 1) * clientLimit;
        return { code: 0, msg: '', count: data.length, data: data.slice(offset, offset + clientLimit), total_data: cached.totalData };
      }
      return { code: 0, msg: '', count: cached.rowCount, data, total_data: cached.totalData };
    }

    // 2. Cache miss → fetch từ API
    const result = await fetchWithRelogin(agent, endpointKey, fetchParams);

    if (Array.isArray(result.data)) {
      result.data.forEach(row => { row._agent_id = agent.id; row._agent_label = agent.label; });
    }

    // Lưu cache + dataStore
    saveResults(agent.id, endpointKey, cacheInfo, result.data, result.total_data);

    // Volatile: paginate server-side
    if (cacheInfo.volatile && Array.isArray(result.data) && result.data.length > clientLimit) {
      const offset = (clientPage - 1) * clientLimit;
      return {
        code: 0, msg: result.msg || '',
        count: result.data.length,
        data: result.data.slice(offset, offset + clientLimit),
        total_data: result.total_data
      };
    }

    return result;
  }

  // ── Multi-agent: fan-out N agents song song ──
  const fetchParams = { ...params, page: 1, limit: 500 };
  const startTime = Date.now();

  log.info(`Fan-out [${endpointKey}] → ${agents.length} agents`, {
    agents: agents.map(a => a.label)
  });

  const results = await Promise.allSettled(
    agents.map(agent =>
      limit(async () => {
        // Thử cache (stale-while-revalidate)
        const cached = tryCacheHit(agent, endpointKey, cacheInfo, staleTTL, fetchParams);
        if (cached) {
          return { agent, data: { code: 0, data: cached.data, total_data: cached.totalData, count: cached.rowCount } };
        }

        // Cache miss → gọi API
        const data = await fetchWithRelogin(agent, endpointKey, fetchParams);
        saveResults(agent.id, endpointKey, cacheInfo, data.data, data.total_data);
        return { agent, data };
      })
    )
  );

  // Gộp kết quả
  let mergedData = [];
  let mergedTotalData = null;
  let successCount = 0;
  let errors = [];

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { agent, data } = r.value;
      successCount++;

      if (Array.isArray(data.data)) {
        data.data.forEach(row => {
          row._agent_id = agent.id;
          row._agent_label = agent.label;
        });
        mergedData = mergedData.concat(data.data);
      }

      // Gộp total_data (cộng dồn các trường số)
      if (data.total_data) {
        if (!mergedTotalData) {
          mergedTotalData = { ...data.total_data };
        } else {
          for (const key in data.total_data) {
            const val = parseFloat(data.total_data[key]);
            if (!isNaN(val)) {
              mergedTotalData[key] = (parseFloat(mergedTotalData[key]) || 0) + val;
            }
          }
        }
      }
    } else {
      errors.push(r.reason?.message || 'Unknown error');
    }
  }

  // Server-side pagination trên merged data
  const totalCount = mergedData.length;
  const offset = (clientPage - 1) * clientLimit;
  const pagedData = mergedData.slice(offset, offset + clientLimit);

  const duration = Date.now() - startTime;
  log.ok(`Fan-out [${endpointKey}] hoàn tất — ${duration}ms`, {
    thànhCông: successCount,
    thấtBại: errors.length,
    tổngDòng: totalCount,
    trangHiện: clientPage,
    sốDòngTrang: pagedData.length
  });

  if (errors.length > 0) {
    log.warn(`Fan-out [${endpointKey}] có ${errors.length} lỗi`, { errors });
  }

  return {
    code: successCount > 0 ? 0 : 1,
    msg: errors.length > 0 ? `${errors.length}/${agents.length} agent lỗi` : '',
    count: totalCount,
    data: pagedData,
    total_data: mergedTotalData
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
    // Thử auto-relogin
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
