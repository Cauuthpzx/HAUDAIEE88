const axios = require('axios');
const ENDPOINTS = require('../config/endpoints');
const { createLogger } = require('../utils/logger');

const log = createLogger('ee88Client');

const BASE_URL = process.env.EE88_BASE_URL;
const COOKIE = process.env.EE88_COOKIE;

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Cookie: COOKIE
  }
});

/**
 * Gọi 1 endpoint ee88
 * @param {string} endpointKey — key trong ENDPOINTS (vd: 'members')
 * @param {object} extraParams — params bổ sung từ client (page, limit, search…)
 * @returns {object} raw JSON response từ ee88
 */
async function fetchEndpoint(endpointKey, extraParams = {}) {
  const cfg = ENDPOINTS[endpointKey];
  if (!cfg) {
    log.error(`Endpoint không tồn tại: ${endpointKey}`);
    throw new Error(`Endpoint không tồn tại: ${endpointKey}`);
  }

  const params = { ...cfg.defaultParams, ...extraParams };

  const qs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

  const url = qs ? `${cfg.path}?${qs}` : cfg.path;

  log.info(`Gửi yêu cầu → EE88 POST ${url}`, { endpoint: endpointKey, params });

  const startTime = Date.now();

  try {
    const res = await client.post(url, null, { timeout: cfg.timeout });
    const duration = Date.now() - startTime;

    // Phát hiện phiên hết hạn
    if (res.data && res.data.url === '/agent/login') {
      log.error(`Phiên đã hết hạn khi gọi [${endpointKey}]`, { tốnThờiGian: `${duration}ms` });
      const err = new Error('Phiên EE88 đã hết hạn');
      err.code = 'SESSION_EXPIRED';
      throw err;
    }

    const rowCount = Array.isArray(res.data.data) ? res.data.data.length : 'N/A';
    log.ok(`Nhận phản hồi ← EE88 [${endpointKey}] ${duration}ms`, {
      mã: res.data.code,
      tổngSố: res.data.count,
      sốDòng: rowCount,
      httpStatus: res.status
    });

    return res.data;
  } catch (err) {
    const duration = Date.now() - startTime;
    if (err.code === 'SESSION_EXPIRED') throw err;

    log.error(`Lỗi ← EE88 [${endpointKey}] THẤT BẠI ${duration}ms`, {
      lỗi: err.message,
      mãLỗi: err.code,
      httpStatus: err.response?.status
    });
    throw err;
  }
}

module.exports = { fetchEndpoint };
