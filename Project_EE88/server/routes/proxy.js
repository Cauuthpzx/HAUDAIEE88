const express = require('express');
const ENDPOINTS = require('../config/endpoints');
const { fanoutFetch } = require('../services/fanout');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { createLogger } = require('../utils/logger');

const log = createLogger('proxy');
const router = express.Router();

// Tất cả data routes cần JWT + permission
router.use(authMiddleware, permissionMiddleware);

// GET /api/data/agents — danh sách agents của user (cho filter)
router.get('/agents', (req, res) => {
  res.json({
    code: 0,
    data: req.agents.map(function (a) {
      return { id: a.id, label: a.label, ee88_username: a.ee88_username };
    })
  });
});

// GET /api/data/:endpoint  (dynamic — fan-out tới N agents)
router.get('/:endpoint', async (req, res) => {
  const endpointKey = req.params.endpoint;

  // Validate endpoint
  if (!ENDPOINTS[endpointKey]) {
    log.warn(`Endpoint không hợp lệ: ${endpointKey}`);
    return res
      .status(404)
      .json({ code: -1, msg: `Endpoint không tồn tại: ${endpointKey}` });
  }

  const startTime = Date.now();
  log.info(`[${req.user.username}] Yêu cầu /${endpointKey}`, {
    agents: req.agents.length,
    truyVấn: req.query
  });

  try {
    // Lọc agents theo agent_ids nếu có
    let agents = req.agents;
    if (req.query.agent_ids) {
      const ids = req.query.agent_ids.split(',').map(Number).filter(Boolean);
      if (ids.length > 0) {
        agents = agents.filter((a) => ids.indexOf(a.id) !== -1);
      }
    }

    const data = await fanoutFetch(agents, endpointKey, req.query);
    const duration = Date.now() - startTime;

    log.ok(`[${req.user.username}] /${endpointKey} — ${duration}ms`, {
      sốDòng: Array.isArray(data.data) ? data.data.length : 0,
      tổngSố: data.count,
      agents: req.agents.length
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
