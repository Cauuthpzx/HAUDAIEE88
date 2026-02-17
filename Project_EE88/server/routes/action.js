const express = require('express');
const axios = require('axios');
const { createLogger } = require('../utils/logger');

const log = createLogger('action');
const router = express.Router();

const BASE_URL = process.env.EE88_BASE_URL;
const COOKIE = process.env.EE88_COOKIE;

const client = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Cookie: COOKIE
  },
  timeout: 15000
});

// Danh sách action cho phép
const ALLOWED_ACTIONS = {
  editPassword: '/agent/editPassword',
  editFundPassword: '/agent/editFundPassword',
  getLottery: '/agent/getLottery',
  getRebateOddsPanel: '/agent/getRebateOddsPanel'
};

// POST /api/action/:action
router.post('/:action', async (req, res) => {
  const actionKey = req.params.action;

  if (!ALLOWED_ACTIONS[actionKey]) {
    log.warn(`Action không hợp lệ: ${actionKey}`);
    return res.status(404).json({ code: -1, msg: `Action không tồn tại: ${actionKey}` });
  }

  const ee88Path = ALLOWED_ACTIONS[actionKey];
  const startTime = Date.now();
  log.info(`Nhận yêu cầu action /${actionKey}`, { body: req.body, ip: req.ip });

  try {
    const params = new URLSearchParams(req.body).toString();
    const response = await client.post(ee88Path, params);
    const duration = Date.now() - startTime;

    // Phát hiện phiên hết hạn
    if (response.data && response.data.url === '/agent/login') {
      log.error(`Action [${actionKey}] — Phiên hết hạn — ${duration}ms`);
      return res.status(401).json({ code: -1, msg: 'Phiên EE88 đã hết hạn' });
    }

    log.ok(`Action [${actionKey}] thành công — ${duration}ms`, { mã: response.data.code });
    res.json(response.data);
  } catch (err) {
    const duration = Date.now() - startTime;
    log.error(`Action [${actionKey}] — Thất bại — ${duration}ms`, { lỗi: err.message });
    res.status(502).json({ code: -1, msg: 'Không thể thực hiện hành động trên EE88' });
  }
});

module.exports = router;
