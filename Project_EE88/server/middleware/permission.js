const { getDb } = require('../database/init');
const { createLogger } = require('../utils/logger');

const log = createLogger('permission');

/**
 * Permission middleware (phải dùng sau authMiddleware)
 * Lấy danh sách agent_ids mà user được phép truy cập → req.agentIds
 * Admin được truy cập tất cả agents active
 */
function permissionMiddleware(req, res, next) {
  const db = getDb();
  const user = req.user;

  try {
    let agents;

    if (user.role === 'admin') {
      // Admin: tất cả agents (kể cả expired — fanout sẽ auto-relogin)
      agents = db.prepare(
        'SELECT id, label, base_url, cookie, user_agent, ee88_username, ee88_password, status FROM ee88_agents WHERE status >= 0'
      ).all();
    } else {
      // User: agents được phân quyền (kể cả expired — fanout sẽ auto-relogin)
      agents = db.prepare(`
        SELECT a.id, a.label, a.base_url, a.cookie, a.user_agent, a.ee88_username, a.ee88_password, a.status
        FROM ee88_agents a
        JOIN user_agent_permissions p ON p.agent_id = a.id
        WHERE p.user_id = ? AND a.status >= 0
      `).all(user.id);
    }

    if (agents.length === 0) {
      log.warn(`User ${user.username} không có agent nào`, { userId: user.id });
      return res.status(403).json({ code: -1, msg: 'Không có agent nào được phân quyền' });
    }

    req.agents = agents;
    req.agentIds = agents.map(a => a.id);
    next();
  } catch (err) {
    log.error(`Lỗi kiểm tra quyền: ${err.message}`);
    res.status(500).json({ code: -1, msg: 'Lỗi kiểm tra quyền' });
  }
}

module.exports = { permissionMiddleware };
