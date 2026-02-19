const { getDb } = require('../database/init');
const { createLogger } = require('../utils/logger');

const log = createLogger('permission');

// ── In-memory permission cache (tránh query DB mỗi request) ──
const permCache = new Map();
const PERM_TTL = 15 * 60 * 1000; // 15 phút

function getCachedPerm(userId, role) {
  var key = role + ':' + userId;
  var entry = permCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > PERM_TTL) { permCache.delete(key); return null; }
  return entry.agents;
}

function setCachedPerm(userId, role, agents) {
  var key = role + ':' + userId;
  if (permCache.size > 50) permCache.delete(permCache.keys().next().value);
  permCache.set(key, { agents, ts: Date.now() });
}

function clearPermCache() { permCache.clear(); }

/**
 * Permission middleware (phải dùng sau authMiddleware)
 * Lấy danh sách agent_ids mà user được phép truy cập → req.agentIds
 * Admin được truy cập tất cả agents active
 */
function permissionMiddleware(req, res, next) {
  const db = getDb();
  const user = req.user;

  try {
    let agents = getCachedPerm(user.id, user.role);

    if (!agents) {
      if (user.role === 'admin') {
        agents = db.prepare(
          'SELECT id, label, base_url, cookie, user_agent, ee88_username, ee88_password, status FROM ee88_agents WHERE status >= 0'
        ).all();
      } else {
        agents = db.prepare(`
          SELECT a.id, a.label, a.base_url, a.cookie, a.user_agent, a.ee88_username, a.ee88_password, a.status
          FROM ee88_agents a
          JOIN user_agent_permissions p ON p.agent_id = a.id
          WHERE p.user_id = ? AND a.status >= 0
        `).all(user.id);
      }
      setCachedPerm(user.id, user.role, agents);
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

module.exports = { permissionMiddleware, clearPermCache };
