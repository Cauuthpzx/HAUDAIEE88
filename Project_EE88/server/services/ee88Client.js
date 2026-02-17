const axios = require('axios');
const ENDPOINTS = require('../config/endpoints');
const { createLogger } = require('../utils/logger');

const log = createLogger('ee88Client');

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Tạo axios client cho 1 agent cụ thể
 * Dùng agent.user_agent (từ cloudscraper lúc login) để khớp cf_clearance
 */
function createClient(agent) {
  return axios.create({
    baseURL: agent.base_url,
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': agent.user_agent || DEFAULT_UA,
      Cookie: agent.cookie
    }
  });
}

/**
 * Gọi 1 endpoint ee88 cho 1 agent cụ thể
 * @param {object} agent — { id, label, base_url, cookie }
 * @param {string} endpointKey — key trong ENDPOINTS (vd: 'members')
 * @param {object} extraParams — params bổ sung từ client (page, limit, search…)
 * @returns {object} raw JSON response từ ee88
 */
async function fetchEndpointForAgent(agent, endpointKey, extraParams = {}) {
  const cfg = ENDPOINTS[endpointKey];
  if (!cfg) {
    throw new Error(`Endpoint không tồn tại: ${endpointKey}`);
  }

  const params = { ...cfg.defaultParams, ...extraParams };

  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const url = qs ? `${cfg.path}?${qs}` : cfg.path;
  const agentLabel = agent.label || `Agent#${agent.id}`;

  log.info(`[${agentLabel}] → EE88 POST ${url}`, { endpoint: endpointKey });

  const startTime = Date.now();
  const client = createClient(agent);

  try {
    const res = await client.post(url, null, { timeout: cfg.timeout });
    const duration = Date.now() - startTime;

    // Phát hiện phiên hết hạn
    if (res.data && res.data.url === '/agent/login') {
      log.error(`[${agentLabel}] Phiên hết hạn [${endpointKey}] — ${duration}ms`);
      const err = new Error(`Phiên EE88 đã hết hạn (${agentLabel})`);
      err.code = 'SESSION_EXPIRED';
      err.agentId = agent.id;
      throw err;
    }

    const rowCount = Array.isArray(res.data.data) ? res.data.data.length : 'N/A';
    log.ok(`[${agentLabel}] ← EE88 [${endpointKey}] ${duration}ms`, {
      mã: res.data.code,
      sốDòng: rowCount,
      tổngSố: res.data.count
    });

    return res.data;
  } catch (err) {
    const duration = Date.now() - startTime;
    if (err.code === 'SESSION_EXPIRED') throw err;

    log.error(`[${agentLabel}] ← EE88 [${endpointKey}] THẤT BẠI ${duration}ms`, {
      lỗi: err.message,
      mãLỗi: err.code
    });
    throw err;
  }
}

/**
 * Backward-compatible: gọi endpoint với agent từ .env (legacy)
 */
async function fetchEndpoint(endpointKey, extraParams = {}) {
  const agent = {
    id: 0,
    label: 'Legacy',
    base_url: process.env.EE88_BASE_URL,
    cookie: process.env.EE88_COOKIE
  };
  return fetchEndpointForAgent(agent, endpointKey, extraParams);
}

module.exports = { fetchEndpoint, fetchEndpointForAgent, createClient };
