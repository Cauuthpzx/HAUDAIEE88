const jwt = require('jsonwebtoken');
const config = require('../config/default');
const { createLogger } = require('../utils/logger');

const log = createLogger('auth');

/**
 * JWT Authentication middleware
 * Verify token từ header Authorization: Bearer <token>
 * Gán req.user = { id, username, role }
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: -1, msg: 'Chưa đăng nhập' });
  }

  const token = authHeader.slice(7);

  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = {
      id: decoded.id,
      username: decoded.username,
      role: decoded.role
    };
    next();
  } catch (err) {
    log.warn(`Token không hợp lệ: ${err.message}`, { ip: req.ip });
    return res.status(401).json({ code: -1, msg: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

/**
 * Admin-only middleware (phải dùng sau authMiddleware)
 */
function adminOnly(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ code: -1, msg: 'Không có quyền truy cập' });
  }
  next();
}

module.exports = { authMiddleware, adminOnly };
