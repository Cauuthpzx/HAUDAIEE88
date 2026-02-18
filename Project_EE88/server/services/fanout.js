const axios = require('axios');
const pLimit = require('p-limit');
const { fetchEndpointForAgent } = require('./ee88Client');
const { autoRelogin } = require('./loginService');
const dataStore = require('./dataStore');
const config = require('../config/default');
const { createLogger } = require('../utils/logger');

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const log = createLogger('fanout');
const limit = pLimit(config.fanout.concurrency);

// ═══════════════════════════════════════
// ── Display Cache (in-memory) ──
// Giữ response đã hiển thị → lần sau load nhanh
// ═══════════════════════════════════════

const displayCache = new Map();
const refreshLocks = new Map();
const MAX_CACHE_SIZE = 100;
const CACHE_MAX_AGE = 30 * 60 * 1000;
const STALE_TTL = 5 * 60 * 1000; // 5 phút

function makeCacheKey(agentIds, endpointKey, params) {
  const ids = agentIds.slice().sort().join(',');
  const keys = Object.keys(params).filter(k => k !== 'page' && k !== 'limit').sort();
  const paramStr = keys.map(k => k + '=' + params[k]).join('&');
  return ids + ':' + endpointKey + ':' + paramStr;
}

function evictStaleEntries() {
  const now = Date.now();
  for (const [k, v] of displayCache) {
    if (now - v.timestamp > CACHE_MAX_AGE) displayCache.delete(k);
  }
  while (displayCache.size > MAX_CACHE_SIZE) {
    displayCache.delete(displayCache.keys().next().value);
  }
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

/**
 * Fetch full dataset cho tất cả agents — trực tiếp từ EE88 API
 */
async function fetchAllData(agents, endpointKey, params) {
  const fetchParams = { ...params, page: 1, limit: 500 };

  let allData = [];
  let totalData = null;
  let successCount = 0;
  let errors = [];

  const results = await Promise.allSettled(
    agents.map(agent =>
      limit(async () => {
        const data = await fetchWithRelogin(agent, endpointKey, fetchParams);

        // Lưu vào dataStore (fail-safe)
        try {
          if (Array.isArray(data.data) && data.data.length > 0) {
            dataStore.saveData(agent.id, endpointKey, data.data, data.total_data, null);
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

function scheduleRefresh(agents, endpointKey, params, cacheKey) {
  if (refreshLocks.has(cacheKey)) return;
  refreshLocks.set(cacheKey, true);

  fetchAllData(agents, endpointKey, params)
    .then(result => {
      displayCache.set(cacheKey, {
        allData: result.allData,
        totalData: result.totalData,
        timestamp: Date.now()
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
// ── Fan-out fetch ──
// ═══════════════════════════════════════

async function fanoutFetch(agents, endpointKey, params) {
  if (agents.length === 0) {
    return { code: 0, msg: '', count: 0, data: [], total_data: null };
  }

  const clientPage = parseInt(params.page) || 1;
  const clientLimit = parseInt(params.limit) || 10;
  const agentIds = agents.map(a => a.id);
  const key = makeCacheKey(agentIds, endpointKey, params);

  // 1. Display cache hit
  const cached = displayCache.get(key);
  if (cached) {
    const age = Date.now() - cached.timestamp;
    if (age > STALE_TTL) {
      log.info(`Display STALE: ${endpointKey} (${Math.round(age / 1000)}s) — bg refresh`);
      scheduleRefresh(agents, endpointKey, params, key);
    } else {
      log.info(`Display HIT: ${endpointKey} (${cached.allData.length} rows)`);
    }

    const offset = (clientPage - 1) * clientLimit;
    return {
      code: 0, msg: '',
      count: cached.allData.length,
      data: cached.allData.slice(offset, offset + clientLimit),
      total_data: cached.totalData
    };
  }

  // 2. Blocking fetch từ EE88
  const startTime = Date.now();
  log.info(`Display MISS: ${endpointKey} — fetching ${agents.length} agent(s)...`);

  const result = await fetchAllData(agents, endpointKey, params);

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
