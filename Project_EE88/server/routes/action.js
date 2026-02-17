const express = require('express');
const { fanoutAction } = require('../services/fanout');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { createLogger } = require('../utils/logger');

const log = createLogger('action');
const router = express.Router();

// Danh sách action cho phép
const ALLOWED_ACTIONS = {
  editPassword: '/agent/editPassword',
  editFundPassword: '/agent/editFundPassword',
  getLottery: '/agent/getLottery',
  getRebateOddsPanel: '/agent/getRebateOddsPanel',
  addUser: '/agent/addUser',
  setRebate: '/agent/setRebate',
  addInvite: '/agent/addInvite',
  editInvite: '/agent/editInvite'
};

// Tất cả action routes cần JWT + permission
router.use(authMiddleware, permissionMiddleware);

// POST /api/action/:action
router.post('/:action', async (req, res) => {
  const actionKey = req.params.action;

  if (!ALLOWED_ACTIONS[actionKey]) {
    log.warn(`Action không hợp lệ: ${actionKey}`);
    return res.status(404).json({ code: -1, msg: `Action không tồn tại: ${actionKey}` });
  }

  const ee88Path = ALLOWED_ACTIONS[actionKey];
  const startTime = Date.now();

  // Xác định agent: dùng agent_id từ body, hoặc agent đầu tiên
  const agentId = req.body._agent_id;
  let agent;

  if (agentId) {
    agent = req.agents.find(a => a.id === parseInt(agentId));
    if (!agent) {
      return res.status(403).json({ code: -1, msg: 'Không có quyền truy cập agent này' });
    }
  } else {
    // Mặc định dùng agent đầu tiên
    agent = req.agents[0];
  }

  // Loại bỏ _agent_id khỏi body trước khi gửi
  const body = { ...req.body };
  delete body._agent_id;

  log.info(`[${req.user.username}] Action /${actionKey} → ${agent.label}`, { body });

  try {
    const data = await fanoutAction(agent, ee88Path, body);
    const duration = Date.now() - startTime;

    // Phát hiện phiên hết hạn
    if (data && data.url === '/agent/login') {
      log.error(`Action [${actionKey}] — Phiên hết hạn — ${duration}ms`);
      return res.status(401).json({ code: -1, msg: 'Phiên EE88 đã hết hạn' });
    }

    log.ok(`[${req.user.username}] Action [${actionKey}] → ${agent.label} — ${duration}ms`, { mã: data.code });
    res.json(data);
  } catch (err) {
    const duration = Date.now() - startTime;
    log.error(`Action [${actionKey}] — Thất bại — ${duration}ms`, { lỗi: err.message });
    res.status(502).json({ code: -1, msg: 'Không thể thực hiện hành động trên EE88' });
  }
});

module.exports = router;
