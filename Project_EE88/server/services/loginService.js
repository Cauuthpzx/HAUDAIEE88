/**
 * Login Service — Gọi JS captcha solver trực tiếp (không cần Python)
 *
 * Flow:
 *   1. Lấy agent info + decrypt password
 *   2. Gọi captchaSolver.doLogin() trực tiếp (Tesseract.js OCR + RSA)
 *   3. Cập nhật cookie trong DB
 *   4. Post-login sync (nếu không skip)
 */

const { getDb } = require('../database/init');
const { createLogger } = require('../utils/logger');
const { logLoginHistory } = require('./activityLogger');
const { decrypt, isEncrypted } = require('../utils/crypto');
const { doLogin: solverLogin, isSolverReady, getOCRWorker } = require('./captchaSolver');

const log = createLogger('loginService');

// Tránh login đồng thời cho cùng 1 agent
const loginLocks = new Map();

/**
 * Khởi tạo OCR engine (warm up Tesseract.js lần đầu)
 * Gọi lúc server start để user không phải đợi lần đầu login
 */
async function initSolver() {
  try {
    await getOCRWorker();
    return true;
  } catch (err) {
    log.error(`Không khởi tạo được OCR engine: ${err.message}`);
    return false;
  }
}

/**
 * Auto-login 1 agent EE88
 * @param {number} agentId — ID agent trong DB
 * @param {string} [source='manual'] — 'manual' | 'auto' | 'worker'
 * @param {string} [triggeredBy] — username người kích hoạt
 * @param {object} [opts] — { skipSync: true } để bỏ qua post-login sync
 * @returns {Promise<{success, cookie?, error?, attempts?}>}
 */
async function loginAgent(agentId, source, triggeredBy, opts) {
  if (loginLocks.get(agentId)) {
    log.warn(`Agent #${agentId} đang login, bỏ qua`);
    return { success: false, error: 'Đang login, vui lòng đợi' };
  }

  const db = getDb();
  const agent = db.prepare('SELECT * FROM ee88_agents WHERE id = ?').get(agentId);
  if (!agent) return { success: false, error: 'Agent không tồn tại' };
  if (!agent.ee88_username || !agent.ee88_password) {
    return { success: false, error: 'Chưa cấu hình username/password EE88' };
  }

  loginLocks.set(agentId, true);
  const startTime = Date.now();
  log.info(`[${agent.label}] Bắt đầu auto-login...`);

  try {
    // Giải mã password
    let plainPassword;
    if (isEncrypted(agent.ee88_password)) {
      try {
        plainPassword = decrypt(agent.ee88_password);
      } catch {
        log.error(`[${agent.label}] Không giải mã được password`);
        return { success: false, error: 'Lỗi giải mã password — ENCRYPTION_KEY không khớp' };
      }
    } else {
      plainPassword = agent.ee88_password;
    }

    // Gọi JS solver trực tiếp (không cần Python)
    const result = await solverLogin(
      agent.base_url,
      agent.ee88_username,
      plainPassword,
      10
    );

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
      logLoginHistory({ agentId, agentLabel: agent.label, success: true, attempts: result.attempts, source: source || 'manual', triggeredBy, durationMs: duration });

      // Post-login sync (background)
      if (!(opts && opts.skipSync)) {
        const { syncAfterLogin } = require('./cronSync');
        syncAfterLogin(agentId).catch(err => {
          log.error(`[${agent.label}] Post-login sync lỗi: ${err.message}`);
        });
      }

      return { success: true, cookie: newCookie, user_agent: newUA, attempts: result.attempts };
    }

    log.error(`[${agent.label}] Login thất bại — ${result.error} — ${duration}ms`);
    logLoginHistory({ agentId, agentLabel: agent.label, success: false, attempts: result.attempts || 0, errorMsg: result.error || 'Login thất bại', source: source || 'manual', triggeredBy, durationMs: duration });
    return { success: false, error: result.error || 'Login thất bại', attempts: result.attempts || 0 };
  } catch (err) {
    const duration = Date.now() - startTime;
    log.error(`[${agent.label}] Login exception — ${err.message} — ${duration}ms`);
    logLoginHistory({ agentId, agentLabel: agent.label, success: false, errorMsg: err.message, source: source || 'manual', triggeredBy, durationMs: duration });
    return { success: false, error: err.message };
  } finally {
    loginLocks.delete(agentId);
  }
}

/**
 * Auto-login agent khi phát hiện session expired
 */
async function autoRelogin(agent) {
  if (!agent.ee88_username || !agent.ee88_password) {
    log.warn(`[${agent.label}] Không thể auto-login: chưa có username/password`);
    return null;
  }

  const result = await loginAgent(agent.id, 'auto', undefined, { skipSync: true });
  if (result.success) {
    return { ...agent, cookie: result.cookie, user_agent: result.user_agent || agent.user_agent };
  }
  return null;
}

module.exports = { loginAgent, autoRelogin, isSolverReady, initSolver };
