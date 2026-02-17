const express = require('express');
const { fetchEndpoint } = require('../services/ee88Client');
const { createLogger } = require('../utils/logger');

const log = createLogger('proxy');
const router = express.Router();

// GET /api/data/members
router.get('/members', async (req, res) => {
  const startTime = Date.now();
  log.info('Nhận yêu cầu /members', { truyVấn: req.query, ip: req.ip });

  try {
    const data = await fetchEndpoint('members', req.query);
    const duration = Date.now() - startTime;

    log.ok(`Trả kết quả /members thành công — ${duration}ms`, {
      mã: data.code,
      sốDòng: Array.isArray(data.data) ? data.data.length : 0,
      tổngSố: data.count
    });

    res.json(data);
  } catch (err) {
    const duration = Date.now() - startTime;

    if (err.code === 'SESSION_EXPIRED') {
      log.error(`/members — Phiên hết hạn — ${duration}ms`);
      return res.status(401).json({ code: -1, msg: 'Phiên EE88 đã hết hạn' });
    }

    log.error(`/members — Thất bại — ${duration}ms`, {
      lỗi: err.message,
      mãLỗi: err.code
    });
    res.status(502).json({ code: -1, msg: 'Không thể lấy dữ liệu từ EE88' });
  }
});

module.exports = router;
