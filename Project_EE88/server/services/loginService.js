/**
 * Login Service — Gọi Python captcha solver để auto-login EE88
 *
 * Flow:
 *   1. Gọi POST http://localhost:5000/login
 *   2. Python solver: lấy RSA key → captcha → ddddocr → submit login
 *   3. Trả về PHPSESSID mới
 *   4. Cập nhật cookie trong DB
 */

const axios = require('axios');
const { getDb } = require('../database/init');
const { createLogger } = require('../utils/logger');

const log = createLogger('loginService');

const SOLVER_URL = process.env.SOLVER_URL || 'http://localhost:5000';
const SOLVER_TIMEOUT = 60000; // 60s (captcha có thể retry nhiều lần)

// Tránh login đồng thời cho cùng 1 agent
const loginLocks = new Map();

/**
 * Kiểm tra Python solver service có chạy không
 * @returns {Promise<boolean>}
 */
async function isSolverReady() {
  try {
    const res = await axios.get(`${SOLVER_URL}/health`, { timeout: 3000 });
    return res.data && res.data.status === 'ok';
  } catch {
    return false;
  }
}

/**
 * Auto-login 1 agent EE88
 * @param {number} agentId — ID agent trong DB
 * @returns {Promise<{success: boolean, cookie?: string, error?: string, attempts?: number}>}
 */
async function loginAgent(agentId) {
  // Check lock — tránh login đồng thời
  if (loginLocks.get(agentId)) {
    log.warn(`Agent #${agentId} đang login, bỏ qua`);
    return { success: false, error: 'Đang login, vui lòng đợi' };
  }

  const db = getDb();
  const agent = db.prepare('SELECT * FROM ee88_agents WHERE id = ?').get(agentId);
  if (!agent) {
    return { success: false, error: 'Agent không tồn tại' };
  }

  if (!agent.ee88_username || !agent.ee88_password) {
    return { success: false, error: 'Chưa cấu hình username/password EE88' };
  }

  // Set lock
  loginLocks.set(agentId, true);
  const startTime = Date.now();
  log.info(`[${agent.label}] Bắt đầu auto-login...`);

  try {
    // Kiểm tra solver
    const ready = await isSolverReady();
    if (!ready) {
      return { success: false, error: 'Python solver service chưa chạy (port 5000)' };
    }

    // Gọi solver
    const res = await axios.post(`${SOLVER_URL}/login`, {
      base_url: agent.base_url,
      username: agent.ee88_username,
      password: agent.ee88_password,
      max_retries: 10
    }, { timeout: SOLVER_TIMEOUT });

    const result = res.data;
    const duration = Date.now() - startTime;

    if (result.success && result.phpsessid) {
      const newCookie = result.cookies || `PHPSESSID=${result.phpsessid}`;
      const newUA = result.user_agent || '';

      db.prepare(`
        UPDATE ee88_agents
        SET cookie = ?, user_agent = ?, status = 1,
            last_login = datetime('now', 'localtime'),
            updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(newCookie, newUA, agentId);

      log.ok(`[${agent.label}] Login thành công — ${result.attempts} lần thử — ${duration}ms`);
      return {
        success: true,
        cookie: newCookie,
        user_agent: newUA,
        attempts: result.attempts
      };
    }

    log.error(`[${agent.label}] Login thất bại — ${result.error} — ${duration}ms`);
    return {
      success: false,
      error: result.error || 'Login thất bại',
      attempts: result.attempts || 0
    };
  } catch (err) {
    const duration = Date.now() - startTime;
    log.error(`[${agent.label}] Login exception — ${err.message} — ${duration}ms`);
    return { success: false, error: err.message };
  } finally {
    loginLocks.delete(agentId);
  }
}

/**
 * Auto-login agent khi phát hiện session expired
 * Trả về agent object mới nếu thành công (cookie đã cập nhật)
 * @param {object} agent — { id, label, base_url, cookie, ee88_username, ee88_password }
 * @returns {Promise<object|null>} — agent mới hoặc null nếu thất bại
 */
async function autoRelogin(agent) {
  if (!agent.ee88_username || !agent.ee88_password) {
    log.warn(`[${agent.label}] Không thể auto-login: chưa có username/password`);
    return null;
  }

  const result = await loginAgent(agent.id);
  if (result.success) {
    return { ...agent, cookie: result.cookie, user_agent: result.user_agent || agent.user_agent };
  }

  return null;
}

module.exports = { loginAgent, autoRelogin, isSolverReady };
