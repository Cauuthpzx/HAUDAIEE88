const axios = require('axios');
const ENDPOINTS = require('../config/endpoints');
const { createLogger } = require('../utils/logger');

const log = createLogger('ee88Client');

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ── Client cache: tái sử dụng TCP connection per agent ──
const clientCache = new Map(); // key: agentId, value: { client, cookie, ua }

/**
 * Tạo hoặc lấy cached axios client cho 1 agent cụ thể.
 * Reuse client = reuse TCP connection (keep-alive) → giảm latency.
 * Chỉ tạo mới khi cookie/UA thay đổi (relogin).
 */
function createClient(agent) {
  const key = agent.id || 0;
  const cached = clientCache.get(key);

  // Reuse nếu cookie + UA khớp
  if (
    cached &&
    cached.cookie === agent.cookie &&
    cached.ua === (agent.user_agent || DEFAULT_UA)
  ) {
    return cached.client;
  }

  const client = axios.create({
    baseURL: agent.base_url,
    timeout: 30000, // 30s default timeout — tránh treo vô hạn
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': agent.user_agent || DEFAULT_UA,
      Cookie: agent.cookie
    }
  });

  clientCache.set(key, {
    client,
    cookie: agent.cookie,
    ua: agent.user_agent || DEFAULT_UA
  });
  return client;
}

/**
 * Gọi 1 endpoint ee88 cho 1 agent cụ thể
 * Gửi params dưới dạng POST body (form-urlencoded) — khớp cách EE88 API hoạt động.
 *
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

  // Build form-urlencoded body (giống reference: POST body, không phải query string)
  const body = Object.entries(params)
    .map(([k, v]) => {
      if (v === undefined || v === null) return null;
      return `${encodeURIComponent(k)}=${encodeURIComponent(v)}`;
    })
    .filter(Boolean)
    .join('&');

  const agentLabel = agent.label || `Agent#${agent.id}`;

  log.info(`[${agentLabel}] → EE88 POST ${cfg.path}`, {
    endpoint: endpointKey,
    body: body.substring(0, 200)
  });

  const startTime = Date.now();
  const client = createClient(agent);

  try {
    const res = await client.post(cfg.path, body, { timeout: cfg.timeout });
    const duration = Date.now() - startTime;

    // Phát hiện phiên hết hạn
    if (res.data && res.data.url === '/agent/login') {
      log.error(
        `[${agentLabel}] Phiên hết hạn [${endpointKey}] — ${duration}ms`
      );
      const err = new Error(`Phiên EE88 đã hết hạn (${agentLabel})`);
      err.code = 'SESSION_EXPIRED';
      err.agentId = agent.id;
      throw err;
    }

    const rowCount = Array.isArray(res.data.data)
      ? res.data.data.length
      : 'N/A';
    log.ok(`[${agentLabel}] ← EE88 [${endpointKey}] ${duration}ms`, {
      mã: res.data.code,
      sốDòng: rowCount,
      tổngSố: res.data.count
    });

    return res.data;
  } catch (err) {
    const duration = Date.now() - startTime;
    if (err.code === 'SESSION_EXPIRED') throw err;

    log.error(
      `[${agentLabel}] ← EE88 [${endpointKey}] THẤT BẠI ${duration}ms`,
      {
        lỗi: err.message,
        mãLỗi: err.code
      }
    );
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
