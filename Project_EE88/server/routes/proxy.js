const express = require('express');
const ENDPOINTS = require('../config/endpoints');
const { fetchEndpoint } = require('../services/ee88Client');
const { createLogger } = require('../utils/logger');

const log = createLogger('proxy');
const router = express.Router();

// GET /api/data/:endpoint  (dynamic — hỗ trợ tất cả endpoints trong config)
router.get('/:endpoint', async (req, res) => {
  const endpointKey = req.params.endpoint;

  // Validate endpoint
  if (!ENDPOINTS[endpointKey]) {
    log.warn(`Endpoint không hợp lệ: ${endpointKey}`);
    return res.status(404).json({ code: -1, msg: `Endpoint không tồn tại: ${endpointKey}` });
  }

  const startTime = Date.now();
  log.info(`Nhận yêu cầu /${endpointKey}`, { truyVấn: req.query, ip: req.ip });

  try {
    const data = await fetchEndpoint(endpointKey, req.query);
    const duration = Date.now() - startTime;

    log.ok(`Trả kết quả /${endpointKey} thành công — ${duration}ms`, {
      mã: data.code,
      sốDòng: Array.isArray(data.data) ? data.data.length : 0,
      tổngSố: data.count
    });

    res.json(data);
  } catch (err) {
    const duration = Date.now() - startTime;

    if (err.code === 'SESSION_EXPIRED') {
      log.error(`/${endpointKey} — Phiên hết hạn — ${duration}ms`);
      return res.status(401).json({ code: -1, msg: 'Phiên EE88 đã hết hạn' });
    }

    log.error(`/${endpointKey} — Thất bại — ${duration}ms`, {
      lỗi: err.message,
      mãLỗi: err.code
    });
    res.status(502).json({ code: -1, msg: 'Không thể lấy dữ liệu từ EE88' });
  }
});

module.exports = router;
