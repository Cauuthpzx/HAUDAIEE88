/**
 * Activity Logger — Ghi nhật ký hoạt động admin (fail-safe)
 *
 * action values:
 *   hub_login, agent_add, agent_edit, agent_delete,
 *   agent_login_success, agent_login_fail, agent_login_all,
 *   user_add, user_edit, user_delete
 */

const { getDb } = require('../database/init');
const { createLogger } = require('../utils/logger');

const log = createLogger('activity');

const insertStmt = () => getDb().prepare(`
  INSERT INTO hub_activity_log (user_id, username, action, target_type, target_id, target_label, detail, ip)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

/**
 * Ghi activity log — không throw lỗi
 * @param {Object} opts
 * @param {number} [opts.userId]
 * @param {string} opts.username
 * @param {string} opts.action
 * @param {string} [opts.targetType] — 'agent' | 'user'
 * @param {number} [opts.targetId]
 * @param {string} [opts.targetLabel]
 * @param {string} [opts.detail]
 * @param {string} [opts.ip]
 */
function logActivity({ userId, username, action, targetType, targetId, targetLabel, detail, ip }) {
  try {
    insertStmt().run(
      userId || null,
      username || 'system',
      action,
      targetType || null,
      targetId || null,
      targetLabel || null,
      detail || null,
      ip || null
    );
  } catch (e) {
    log.warn('Ghi activity log thất bại:', e.message);
  }
}

/**
 * Ghi login history cho agent — không throw lỗi
 */
function logLoginHistory({ agentId, agentLabel, success, attempts, errorMsg, source, triggeredBy, durationMs }) {
  try {
    getDb().prepare(`
      INSERT INTO agent_login_history (agent_id, agent_label, success, attempts, error_msg, source, triggered_by, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      agentId,
      agentLabel || null,
      success ? 1 : 0,
      attempts || 0,
      errorMsg || null,
      source || 'manual',
      triggeredBy || null,
      durationMs || null
    );
  } catch (e) {
    log.warn('Ghi login history thất bại:', e.message);
  }
}

module.exports = { logActivity, logLoginHistory };
