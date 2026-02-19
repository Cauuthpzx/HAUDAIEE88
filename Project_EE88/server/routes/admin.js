const express = require('express');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const { getDb } = require('../database/init');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const { loginAgent, isSolverReady } = require('../services/loginService');
const { getOCRWorker } = require('../services/captchaSolver');
const { logActivity } = require('../services/activityLogger');
const dataStore = require('../services/dataStore');
const { createLogger } = require('../utils/logger');
const { encrypt } = require('../utils/crypto');
const { clearPermCache } = require('../middleware/permission');

const adminEmitter = require('../services/adminEvents');

const log = createLogger('admin');
const router = express.Router();

// ── SSE endpoint (auth via query param vì EventSource không set header được) ──
router.get('/events', (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = 'Bearer ' + req.query.token;
  }
  next();
}, authMiddleware, adminOnly, (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(': connected\n\n');

  function onEvent(data) {
    try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch (e) { cleanup(); }
  }
  adminEmitter.on('change', onEvent);

  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (e) { cleanup(); }
  }, 30000);

  // Auto-close sau 5 phút để tránh leak (client sẽ tự reconnect)
  const maxAge = setTimeout(() => cleanup(), 5 * 60 * 1000);

  let cleaned = false;
  function cleanup() {
    if (cleaned) return;
    cleaned = true;
    adminEmitter.off('change', onEvent);
    clearInterval(hb);
    clearTimeout(maxAge);
    try { res.end(); } catch (e) {}
  }

  req.on('close', cleanup);
  res.on('error', cleanup);
});

// Tất cả admin routes cần auth + admin
router.use(authMiddleware, adminOnly);

// ═══════════════════════════════════════
// ── Dashboard + Activity Log ──
// ═══════════════════════════════════════

// ── Dashboard stats cache (60s TTL) ──
let dashCache = null;
let dashCacheTime = 0;
const DASH_TTL = 5 * 60 * 1000; // 5 phút

// GET /api/admin/dashboard/stats — Aggregated data cho dashboard
router.get('/dashboard/stats', (req, res) => {
  const now = Date.now();
  if (dashCache && (now - dashCacheTime) < DASH_TTL) {
    return res.json(dashCache);
  }

  const db = getDb();

  const getData = db.transaction(() => {
    const agents = db.prepare(`
      SELECT a.id, a.label, a.status, a.base_url, a.last_login, a.last_check,
        COALESCE(p.cnt, 0) as user_count
      FROM ee88_agents a
      LEFT JOIN (SELECT agent_id, COUNT(*) as cnt FROM user_agent_permissions GROUP BY agent_id) p
        ON p.agent_id = a.id
      ORDER BY a.id
    `).all();

    const recentActivity = db.prepare(`
      SELECT id, username, action, target_type, target_label, detail, ip, created_at
      FROM hub_activity_log ORDER BY created_at DESC LIMIT 10
    `).all();

    const loginStats = db.prepare(`
      SELECT agent_id, agent_label,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as fail_count,
        MAX(created_at) as last_attempt
      FROM agent_login_history
      WHERE created_at >= datetime('now', 'localtime', '-7 days')
      GROUP BY agent_id
    `).all();

    return { agents, recentActivity, loginStats };
  });

  const { agents, recentActivity, loginStats } = getData();
  const active = agents.filter(a => a.status === 1).length;
  const expired = agents.filter(a => a.status === 0).length;

  const result = {
    code: 0,
    data: {
      agents,
      agentCount: { active, expired, total: agents.length },
      recentActivity,
      loginStats
    }
  };

  dashCache = result;
  dashCacheTime = now;
  res.json(result);
});

// GET /api/admin/activity-log — Phân trang + filter
router.get('/activity-log', (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  const action = req.query.action || '';
  const username = req.query.username || '';

  let where = '1=1';
  const params = [];

  if (action) {
    where += ' AND action = ?';
    params.push(action);
  }
  if (username) {
    where += ' AND username LIKE ?';
    params.push('%' + username + '%');
  }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM hub_activity_log WHERE ${where}`).get(...params).cnt;
  const rows = db.prepare(`
    SELECT * FROM hub_activity_log WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  res.json({ code: 0, data: rows, count: total, page, limit });
});

// ═══════════════════════════════════════
// ── EE88 Agents CRUD ──
// ═══════════════════════════════════════

// POST /api/admin/agents/login-all — Login hàng loạt agents expired
// Phải đăng ký TRƯỚC routes có :id
router.post('/agents/login-all', async (req, res) => {
  const db = getDb();
  if (!isSolverReady()) {
    return res.json({ code: -1, msg: 'OCR engine chưa sẵn sàng, vui lòng đợi khởi tạo' });
  }

  const agents = db.prepare(`
    SELECT * FROM ee88_agents
    WHERE status = 0 AND ee88_username != '' AND ee88_password != ''
  `).all();

  if (agents.length === 0) {
    return res.json({ code: 0, msg: 'Không có agent nào cần login', data: { success: 0, fail: 0 } });
  }

  log.info(`[${req.user.username}] Login All: ${agents.length} agents expired`);
  logActivity({
    userId: req.user.id, username: req.user.username,
    action: 'agent_login_all',
    detail: `${agents.length} agents`,
    ip: req.ip
  });

  let success = 0, fail = 0;
  const results = [];

  for (const agent of agents) {
    const result = await loginAgent(agent.id, 'auto', req.user.username);
    if (result.success) {
      success++;
      results.push({ id: agent.id, label: agent.label, ok: true, attempts: result.attempts });
    } else {
      fail++;
      results.push({ id: agent.id, label: agent.label, ok: false, error: result.error });
    }
  }

  adminEmitter.emit('change', { type: 'agent', action: 'login-all' });
  res.json({ code: 0, msg: `Login xong: ${success} OK, ${fail} thất bại`, data: { success, fail, results } });
});

// GET /api/admin/agents — Danh sách tất cả agents
router.get('/agents', (req, res) => {
  const db = getDb();
  const agents = db.prepare(`
    SELECT a.*,
      COALESCE(p.cnt, 0) as user_count
    FROM ee88_agents a
    LEFT JOIN (SELECT agent_id, COUNT(*) as cnt FROM user_agent_permissions GROUP BY agent_id) p
      ON p.agent_id = a.id
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
  const encryptedPassword = encrypt(ee88_password);
  const result = db.prepare(
    'INSERT INTO ee88_agents (label, base_url, cookie, ee88_username, ee88_password, status) VALUES (?, ?, ?, ?, ?, 0)'
  ).run(label, base_url, '', ee88_username, encryptedPassword);

  const agentId = result.lastInsertRowid;
  clearPermCache();
  log.ok(`Thêm agent: ${label} (id=${agentId}) — đang auto-login...`);
  logActivity({
    userId: req.user.id, username: req.user.username,
    action: 'agent_add', targetType: 'agent', targetId: agentId, targetLabel: label,
    ip: req.ip
  });

  // Auto-login ngay sau khi tạo
  try {
    const loginResult = await loginAgent(agentId, 'manual', req.user.username);
    if (loginResult.success) {
      // Auto-create hub user cho agent (nếu chưa có) — atomic transaction
      const autoCreateUser = db.transaction(() => {
        const existingUser = db.prepare('SELECT id FROM hub_users WHERE username = ?').get(ee88_username);
        if (!existingUser) {
          const hash = bcrypt.hashSync(ee88_password, 10);
          const userResult = db.prepare(
            "INSERT INTO hub_users (username, password_hash, display_name, role) VALUES (?, ?, ?, 'user')"
          ).run(ee88_username, hash, label);
          db.prepare('INSERT INTO user_agent_permissions (user_id, agent_id) VALUES (?, ?)').run(userResult.lastInsertRowid, agentId);
          log.ok(`Auto-tạo user "${ee88_username}" (id=${userResult.lastInsertRowid}) gắn agent #${agentId}`);
        }
      });
      autoCreateUser();
      res.json({ code: 0, msg: `Đã thêm + login thành công (${loginResult.attempts} lần thử)`, data: { id: agentId } });
    } else {
      res.json({ code: 0, msg: `Đã thêm agent, login thất bại: ${loginResult.error}`, data: { id: agentId } });
    }
  } catch (err) {
    res.json({ code: 0, msg: `Đã thêm agent, login lỗi: ${err.message}`, data: { id: agentId } });
  }
  adminEmitter.emit('change', { type: 'agent', action: 'add', id: agentId });
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

  // Encrypt password mới nếu có, giữ nguyên password cũ (đã encrypted) nếu không
  const newPassword = ee88_password ? encrypt(ee88_password) : (agent.ee88_password || '');

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
    newPassword,
    status !== undefined ? status : agent.status,
    id
  );

  clearPermCache();
  log.ok(`Sửa agent #${id}: ${label || agent.label}`);
  logActivity({
    userId: req.user.id, username: req.user.username,
    action: 'agent_edit', targetType: 'agent', targetId: parseInt(id), targetLabel: label || agent.label,
    ip: req.ip
  });
  res.json({ code: 0, msg: 'Đã cập nhật agent' });
  adminEmitter.emit('change', { type: 'agent', action: 'edit', id: parseInt(id) });
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
  clearPermCache();
  log.ok(`Xoá agent #${id}: ${agent.label}`);
  logActivity({
    userId: req.user.id, username: req.user.username,
    action: 'agent_delete', targetType: 'agent', targetId: parseInt(id), targetLabel: agent.label,
    ip: req.ip
  });
  res.json({ code: 0, msg: 'Đã xoá agent' });
  adminEmitter.emit('change', { type: 'agent', action: 'delete', id: parseInt(id) });
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
      adminEmitter.emit('change', { type: 'agent', action: 'check', id: parseInt(id) });
      return res.json({ code: 1, msg: 'Phiên đã hết hạn', status: 0 });
    }

    db.prepare("UPDATE ee88_agents SET last_check = datetime('now', 'localtime'), status = 1, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
    adminEmitter.emit('change', { type: 'agent', action: 'check', id: parseInt(id) });
    res.json({ code: 0, msg: 'Hoạt động bình thường', status: 1 });
  } catch (err) {
    db.prepare("UPDATE ee88_agents SET last_check = datetime('now', 'localtime'), status = 0, updated_at = datetime('now', 'localtime') WHERE id = ?").run(id);
    adminEmitter.emit('change', { type: 'agent', action: 'check', id: parseInt(id) });
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

  if (!isSolverReady()) {
    return res.json({ code: -1, msg: 'OCR engine chưa sẵn sàng, vui lòng đợi khởi tạo' });
  }

  log.info(`[${req.user.username}] Yêu cầu login agent #${id}: ${agent.label}`);

  const result = await loginAgent(id, 'manual', req.user.username);
  if (result.success) {
    logActivity({
      userId: req.user.id, username: req.user.username,
      action: 'agent_login_success', targetType: 'agent', targetId: parseInt(id), targetLabel: agent.label,
      detail: `${result.attempts} attempts`, ip: req.ip
    });
    adminEmitter.emit('change', { type: 'agent', action: 'login', id: parseInt(id) });
    res.json({ code: 0, msg: `Login thành công (${result.attempts} lần thử)`, attempts: result.attempts });
  } else {
    logActivity({
      userId: req.user.id, username: req.user.username,
      action: 'agent_login_fail', targetType: 'agent', targetId: parseInt(id), targetLabel: agent.label,
      detail: result.error, ip: req.ip
    });
    res.json({ code: -1, msg: result.error || 'Login thất bại', attempts: result.attempts || 0 });
  }
});

// GET /api/admin/agents/:id/login-history — Lịch sử login 1 agent
router.get('/agents/:id/login-history', (req, res) => {
  const id = req.params.id;
  const db = getDb();

  const rows = db.prepare(`
    SELECT * FROM agent_login_history
    WHERE agent_id = ?
    ORDER BY created_at DESC
    LIMIT 50
  `).all(id);

  res.json({ code: 0, data: rows });
});

// GET /api/admin/solver-status — Kiểm tra OCR solver (Tesseract.js)
router.get('/solver-status', (req, res) => {
  res.json({ code: 0, data: { running: isSolverReady(), engine: 'tesseract.js' } });
});

// ═══════════════════════════════════════
// ── Data Store — query data đã lưu ──
// ═══════════════════════════════════════

// GET /api/admin/data-store/stats — Thống kê data đã lưu
router.get('/data-store/stats', (req, res) => {
  const stats = dataStore.getDataStats();
  res.json({ code: 0, data: stats });
});

// GET /api/admin/data-store/:endpoint — Query data từ bảng
router.get('/data-store/:endpoint', (req, res) => {
  const endpointKey = req.params.endpoint;
  if (!dataStore.COLUMN_MAP[endpointKey]) {
    return res.status(404).json({ code: -1, msg: `Endpoint không tồn tại: ${endpointKey}` });
  }

  const { agent_id, date_key, page, limit, search, order_by, order } = req.query;
  const result = dataStore.queryData(endpointKey, {
    agentId: agent_id ? parseInt(agent_id) : undefined,
    dateKey: date_key,
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 50, 500),
    search,
    orderBy: order_by,
    order: order || 'DESC'
  });

  res.json({ code: 0, ...result });
});

// DELETE /api/admin/data-store/:endpoint — Xoá data
router.delete('/data-store/:endpoint', (req, res) => {
  const endpointKey = req.params.endpoint;
  if (!dataStore.COLUMN_MAP[endpointKey]) {
    return res.status(404).json({ code: -1, msg: `Endpoint không tồn tại: ${endpointKey}` });
  }

  const agentId = req.query.agent_id ? parseInt(req.query.agent_id) : undefined;
  const deleted = dataStore.clearData(endpointKey, agentId);
  logActivity({
    userId: req.user.id, username: req.user.username,
    action: 'data_clear', targetType: 'data', targetLabel: endpointKey,
    detail: `${deleted} rows` + (agentId ? ` agent=${agentId}` : ''),
    ip: req.ip
  });
  res.json({ code: 0, msg: `Đã xoá ${deleted} dòng` });
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
  logActivity({
    userId: req.user.id, username: req.user.username,
    action: 'user_add', targetType: 'user', targetId: userId, targetLabel: username,
    ip: req.ip
  });
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
  if (Array.isArray(agent_ids)) clearPermCache();
  log.ok(`Sửa user #${id}: ${user.username}`);
  logActivity({
    userId: req.user.id, username: req.user.username,
    action: 'user_edit', targetType: 'user', targetId: id, targetLabel: user.username,
    ip: req.ip
  });
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
  logActivity({
    userId: req.user.id, username: req.user.username,
    action: 'user_delete', targetType: 'user', targetId: id, targetLabel: user.username,
    ip: req.ip
  });
  res.json({ code: 0, msg: 'Đã xoá user' });
});

module.exports = router;
