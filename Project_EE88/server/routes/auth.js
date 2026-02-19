const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const { getDb } = require('../database/init');
const config = require('../config/default');
const { authMiddleware } = require('../middleware/auth');
const { createLogger } = require('../utils/logger');
const { logActivity } = require('../services/activityLogger');

const log = createLogger('auth');
const router = express.Router();

// POST /api/auth/login
router.post('/login', (req, res) => {
  let { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ code: -1, msg: 'Thiếu tên đăng nhập hoặc mật khẩu' });
  }

  // Input sanitization
  username = validator.trim(username);
  username = validator.escape(username);
  if (!validator.isLength(username, { min: 2, max: 50 })) {
    return res.status(400).json({ code: -1, msg: 'Tên đăng nhập không hợp lệ' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM hub_users WHERE username = ? AND status = 1').get(username);

  // Account enumeration prevention: same message + same timing for both cases
  if (!user || !bcrypt.compareSync(password, user ? user.password_hash : '$2a$10$invalidhashplaceholderxxx')) {
    log.warn(`Đăng nhập thất bại: ${!user ? 'user không tồn tại' : 'sai mật khẩu'} (${username})`, { ip: req.ip });
    return res.status(401).json({ code: -1, msg: 'Tên đăng nhập hoặc mật khẩu không đúng' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role, tv: user.token_version || 0 },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

  log.ok(`Đăng nhập thành công: ${username} (role: ${user.role})`, { ip: req.ip });
  logActivity({ userId: user.id, username: user.username, action: 'hub_login', ip: req.ip });

  res.json({
    code: 0,
    msg: 'Đăng nhập thành công',
    data: {
      token,
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        role: user.role
      }
    }
  });
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, username, display_name, role, created_at FROM hub_users WHERE id = ?').get(req.user.id);

  if (!user) {
    return res.status(404).json({ code: -1, msg: 'User không tồn tại' });
  }

  // Lấy danh sách agents được phân quyền
  let agents;
  if (user.role === 'admin') {
    agents = db.prepare('SELECT id, label, status FROM ee88_agents').all();
  } else {
    agents = db.prepare(`
      SELECT a.id, a.label, a.status
      FROM ee88_agents a
      JOIN user_agent_permissions p ON p.agent_id = a.id
      WHERE p.user_id = ?
    `).all(user.id);
  }

  res.json({
    code: 0,
    data: { ...user, agents }
  });
});

// POST /api/auth/change-password
router.post('/change-password', authMiddleware, (req, res) => {
  const { old_password, new_password } = req.body;

  if (!old_password || !new_password) {
    return res.status(400).json({ code: -1, msg: 'Thiếu thông tin' });
  }

  if (!validator.isLength(new_password, { min: 6, max: 128 })) {
    return res.status(400).json({ code: -1, msg: 'Mật khẩu mới phải từ 6-128 ký tự' });
  }

  const db = getDb();
  const user = db.prepare('SELECT * FROM hub_users WHERE id = ?').get(req.user.id);

  if (!bcrypt.compareSync(old_password, user.password_hash)) {
    return res.status(400).json({ code: -1, msg: 'Mật khẩu cũ không đúng' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE hub_users SET password_hash = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(hash, user.id);

  log.ok(`Đổi mật khẩu: ${user.username}`);
  res.json({ code: 0, msg: 'Đã đổi mật khẩu' });
});

// POST /api/auth/logout-all — Thu hồi tất cả token (logout all devices)
router.post('/logout-all', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare("UPDATE hub_users SET token_version = token_version + 1, updated_at = datetime('now', 'localtime') WHERE id = ?")
    .run(req.user.id);

  log.ok(`Logout all devices: ${req.user.username}`);
  logActivity({ userId: req.user.id, username: req.user.username, action: 'logout_all', ip: req.ip });
  res.json({ code: 0, msg: 'Đã đăng xuất tất cả thiết bị' });
});

module.exports = router;
