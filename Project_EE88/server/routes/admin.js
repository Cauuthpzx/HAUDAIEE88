const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { getDb } = require('../database/init');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { loginAgent, isSolverReady } = require('../services/loginService');
const { createLogger } = require('../utils/logger');

const log = createLogger('admin');
const router = express.Router();

// Tất cả admin routes cần auth + admin
router.use(authMiddleware, adminOnly);

// ═══════════════════════════════════════
// ── EE88 Agents CRUD ──
// ═══════════════════════════════════════

// GET /api/admin/agents — Danh sách tất cả agents
router.get('/agents', (req, res) => {
  const db = getDb();
  const agents = db.prepare(`
    SELECT a.*,
      (SELECT COUNT(*) FROM user_agent_permissions WHERE agent_id = a.id) as user_count
    FROM ee88_agents a
    ORDER BY a.id
  `).all();

  // Ẩn cookie + password trong response list
  agents.forEach(a => {
    if (a.cookie) {
      const sessId = a.cookie.match(/PHPSESSID=([^;]+)/)?.[1];
      a.cookie_preview = sessId ? `PHPSESSID=${sessId.substring(0, 8)}...` : '***';
    }
    a.has_credentials = !!(a.ee88_username && a.ee88_password);
    delete a.ee88_password; // Không trả password ra client
  });

  res.json({ code: 0, data: agents, count: agents.length });
});

// POST /api/admin/agents — Thêm agent mới
router.post('/agents', async (req, res) => {
  const { label, base_url, ee88_username, ee88_password } = req.body;

  if (!label || !base_url || !ee88_username || !ee88_password) {
    return res.status(400).json({ code: -1, msg: 'Thiếu thông tin (label, base_url, username, password)' });
  }

  const db = getDb();
  const result = db.prepare(
    'INSERT INTO ee88_agents (label, base_url, cookie, ee88_username, ee88_password, status) VALUES (?, ?, ?, ?, ?, 0)'
  ).run(label, base_url, '', ee88_username, ee88_password);

  const agentId = result.lastInsertRowid;
  log.ok(`Thêm agent: ${label} (id=${agentId}) — đang auto-login...`);

  // Auto-login ngay sau khi tạo
  try {
    const loginResult = await loginAgent(agentId);
    if (loginResult.success) {
      res.json({ code: 0, msg: `Đã thêm + login thành công (${loginResult.attempts} lần thử)`, data: { id: agentId } });
    } else {
      res.json({ code: 0, msg: `Đã thêm agent, login thất bại: ${loginResult.error}`, data: { id: agentId } });
    }
  } catch (err) {
    res.json({ code: 0, msg: `Đã thêm agent, login lỗi: ${err.message}`, data: { id: agentId } });
  }
});

// PUT /api/admin/agents/:id — Sửa agent
router.put('/agents/:id', (req, res) => {
  const { label, base_url, cookie, status, ee88_username, ee88_password } = req.body;
  const id = req.params.id;

  const db = getDb();
  const agent = db.prepare('SELECT * FROM ee88_agents WHERE id = ?').get(id);
  if (!agent) {
    return res.status(404).json({ code: -1, msg: 'Agent không tồn tại' });
  }

  db.prepare(`
    UPDATE ee88_agents
    SET label = ?, base_url = ?, cookie = ?, ee88_username = ?, ee88_password = ?,
        status = ?, updated_at = datetime('now', 'localtime')
    WHERE id = ?
  `).run(
    label || agent.label,
    base_url || agent.base_url,
    cookie || agent.cookie,
    ee88_username !== undefined ? ee88_username : (agent.ee88_username || ''),
    ee88_password || agent.ee88_password || '',
    status !== undefined ? status : agent.status,
    id
  );

  log.ok(`Sửa agent #${id}: ${label || agent.label}`);
  res.json({ code: 0, msg: 'Đã cập nhật agent' });
});

// DELETE /api/admin/agents/:id — Xoá agent
router.delete('/agents/:id', (req, res) => {
  const id = req.params.id;
  const db = getDb();

  const agent = db.prepare('SELECT * FROM ee88_agents WHERE id = ?').get(id);
  if (!agent) {
    return res.status(404).json({ code: -1, msg: 'Agent không tồn tại' });
  }

  db.prepare('DELETE FROM ee88_agents WHERE id = ?').run(id);
  log.ok(`Xoá agent #${id}: ${agent.label}`);
  res.json({ code: 0, msg: 'Đã xoá agent' });
});

// POST /api/admin/agents/:id/check — Kiểm tra agent còn hoạt động
router.post('/agents/:id/check', async (req, res) => {
  const id = req.params.id;
  const db = getDb();

  const agent = db.prepare('SELECT * FROM ee88_agents WHERE id = ?').get(id);
  if (!agent) {
    return res.status(404).json({ code: -1, msg: 'Agent không tồn tại' });
  }

  const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  try {
    const client = axios.create({
      baseURL: agent.base_url,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': agent.user_agent || DEFAULT_UA,
        Cookie: agent.cookie
      },
      timeout: 10000
    });

    const response = await client.post('/agent/user.html?page=1&limit=1');

    if (response.data && response.data.url === '/agent/login') {
      db.prepare("UPDATE ee88_agents SET last_check = datetime('now', 'localtime'), status = 0, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
      return res.json({ code: 1, msg: 'Phiên đã hết hạn', status: 0 });
    }

    db.prepare("UPDATE ee88_agents SET last_check = datetime('now', 'localtime'), status = 1, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
    res.json({ code: 0, msg: 'Hoạt động bình thường', status: 1 });
  } catch (err) {
    db.prepare("UPDATE ee88_agents SET last_check = datetime('now', 'localtime'), status = 0, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
    res.json({ code: 1, msg: `Lỗi: ${err.message}`, status: 0 });
  }
});

// POST /api/admin/agents/:id/login — Auto-login agent (gọi Python solver)
router.post('/agents/:id/login', async (req, res) => {
  const id = req.params.id;
  const db = getDb();

  const agent = db.prepare('SELECT * FROM ee88_agents WHERE id = ?').get(id);
  if (!agent) {
    return res.status(404).json({ code: -1, msg: 'Agent không tồn tại' });
  }

  if (!agent.ee88_username || !agent.ee88_password) {
    return res.json({ code: -1, msg: 'Chưa cấu hình username/password EE88 cho agent này' });
  }

  const solverReady = await isSolverReady();
  if (!solverReady) {
    return res.json({ code: -1, msg: 'Python captcha solver chưa chạy (port 5000)' });
  }

  log.info(`[${req.user.username}] Yêu cầu login agent #${id}: ${agent.label}`);

  const result = await loginAgent(id);
  if (result.success) {
    res.json({ code: 0, msg: `Login thành công (${result.attempts} lần thử)`, attempts: result.attempts });
  } else {
    res.json({ code: -1, msg: result.error || 'Login thất bại', attempts: result.attempts || 0 });
  }
});

// GET /api/admin/solver-status — Kiểm tra Python solver service
router.get('/solver-status', async (req, res) => {
  const ready = await isSolverReady();
  res.json({ code: 0, data: { running: ready } });
});

// ═══════════════════════════════════════
// ── Hub Users CRUD ──
// ═══════════════════════════════════════

// GET /api/admin/users — Danh sách users
router.get('/users', (req, res) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.username, u.display_name, u.role, u.status, u.created_at, u.updated_at
    FROM hub_users u
    ORDER BY u.id
  `).all();

  // Lấy agents cho mỗi user
  const getAgents = db.prepare(`
    SELECT a.id, a.label
    FROM ee88_agents a
    JOIN user_agent_permissions p ON p.agent_id = a.id
    WHERE p.user_id = ?
  `);

  users.forEach(u => {
    u.agents = getAgents.all(u.id);
  });

  res.json({ code: 0, data: users, count: users.length });
});

// POST /api/admin/users — Thêm user
router.post('/users', (req, res) => {
  const { username, password, display_name, role, agent_ids } = req.body;

  if (!username || !password) {
    return res.status(400).json({ code: -1, msg: 'Thiếu tên đăng nhập hoặc mật khẩu' });
  }

  if (password.length < 6) {
    return res.status(400).json({ code: -1, msg: 'Mật khẩu phải ít nhất 6 ký tự' });
  }

  const db = getDb();

  // Check username trùng
  const existing = db.prepare('SELECT id FROM hub_users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ code: -1, msg: 'Tên đăng nhập đã tồn tại' });
  }

  const hash = bcrypt.hashSync(password, 10);

  const insertUser = db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO hub_users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
    ).run(username, hash, display_name || '', role || 'user');

    const userId = result.lastInsertRowid;

    // Gán agents nếu có
    if (Array.isArray(agent_ids) && agent_ids.length > 0) {
      const insertPerm = db.prepare('INSERT INTO user_agent_permissions (user_id, agent_id) VALUES (?, ?)');
      for (const agentId of agent_ids) {
        insertPerm.run(userId, agentId);
      }
    }

    return userId;
  });

  const userId = insertUser();
  log.ok(`Thêm user: ${username} (id=${userId}, role=${role || 'user'})`);
  res.json({ code: 0, msg: 'Đã thêm user', data: { id: userId } });
});

// PUT /api/admin/users/:id — Sửa user
router.put('/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { display_name, role, status, password, agent_ids } = req.body;

  const db = getDb();
  const user = db.prepare('SELECT * FROM hub_users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ code: -1, msg: 'User không tồn tại' });
  }

  const updateUser = db.transaction(() => {
    // Update user info
    if (password && password.length >= 6) {
      const hash = bcrypt.hashSync(password, 10);
      db.prepare("UPDATE hub_users SET password_hash = ?, updated_at = datetime('now', 'localtime') WHERE id = ?").run(hash, id);
    }

    db.prepare(`
      UPDATE hub_users
      SET display_name = ?, role = ?, status = ?, updated_at = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      display_name !== undefined ? display_name : user.display_name,
      role || user.role,
      status !== undefined ? status : user.status,
      id
    );

    // Update agent permissions nếu có
    if (Array.isArray(agent_ids)) {
      db.prepare('DELETE FROM user_agent_permissions WHERE user_id = ?').run(id);
      const insertPerm = db.prepare('INSERT INTO user_agent_permissions (user_id, agent_id) VALUES (?, ?)');
      for (const agentId of agent_ids) {
        insertPerm.run(id, agentId);
      }
    }
  });

  updateUser();
  log.ok(`Sửa user #${id}: ${user.username}`);
  res.json({ code: 0, msg: 'Đã cập nhật user' });
});

// DELETE /api/admin/users/:id — Xoá user
router.delete('/users/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const db = getDb();

  const user = db.prepare('SELECT * FROM hub_users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ code: -1, msg: 'User không tồn tại' });
  }

  // Không cho xoá chính mình
  if (id === req.user.id) {
    return res.status(400).json({ code: -1, msg: 'Không thể xoá chính mình' });
  }

  db.prepare('DELETE FROM hub_users WHERE id = ?').run(id);
  log.ok(`Xoá user #${id}: ${user.username}`);
  res.json({ code: 0, msg: 'Đã xoá user' });
});

module.exports = router;
