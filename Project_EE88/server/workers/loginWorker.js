/**
 * Login Worker — Worker Thread chạy login nền
 *
 * Chức năng:
 *   1. Nhận message { type: 'login', agentId } → gọi loginService → trả kết quả
 *   2. Periodic health check: mỗi 30 phút kiểm tra tất cả agents,
 *      auto-login nếu session expired + có username/password
 *
 * Sử dụng:
 *   const { Worker } = require('worker_threads');
 *   const worker = new Worker('./workers/loginWorker.js');
 *   worker.postMessage({ type: 'login', agentId: 1 });
 *   worker.on('message', msg => { ... });
 */

const { parentPort } = require('worker_threads');

// Worker cần load lại modules vì chạy trong thread riêng
require('dotenv').config();
const axios = require('axios');
const path = require('path');
const { getDb, closeDb } = require('../database/init');
const { loginAgent, isSolverReady } = require('../services/loginService');
const { createLogger } = require('../utils/logger');

const log = createLogger('loginWorker');
const HEALTH_CHECK_INTERVAL = 30 * 60 * 1000; // 30 phút

/**
 * Kiểm tra 1 agent có session hết hạn không
 */
async function checkAgentSession(agent) {
  try {
    const client = axios.create({
      baseURL: agent.base_url,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0',
        Cookie: agent.cookie
      },
      timeout: 10000
    });
    const res = await client.post('/agent/user.html?page=1&limit=1');
    if (res.data && res.data.url === '/agent/login') {
      return false; // Session expired
    }
    return true; // OK
  } catch {
    return false;
  }
}

/**
 * Health check tất cả agents, auto-login nếu cần
 */
async function healthCheckAll() {
  const solverReady = await isSolverReady();
  if (!solverReady) {
    log.warn('Health check: Python solver chưa chạy, bỏ qua');
    return;
  }

  const db = getDb();
  const agents = db.prepare('SELECT * FROM ee88_agents WHERE status >= 0').all();

  if (agents.length === 0) return;

  log.info(`Health check: ${agents.length} agents`);

  for (const agent of agents) {
    const ok = await checkAgentSession(agent);
    const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

    if (ok) {
      db.prepare("UPDATE ee88_agents SET last_check = ?, status = 1, updated_at = ? WHERE id = ?")
        .run(now, now, agent.id);
    } else {
      log.warn(`[${agent.label}] Session hết hạn`);
      db.prepare("UPDATE ee88_agents SET last_check = ?, status = 0, updated_at = ? WHERE id = ?")
        .run(now, now, agent.id);

      // Auto-login nếu có credentials
      if (agent.ee88_username && agent.ee88_password) {
        log.info(`[${agent.label}] Auto-login...`);
        const result = await loginAgent(agent.id, 'worker');
        if (result.success) {
          parentPort.postMessage({
            type: 'login_result',
            agentId: agent.id,
            success: true,
            source: 'health_check'
          });
        } else {
          parentPort.postMessage({
            type: 'login_result',
            agentId: agent.id,
            success: false,
            error: result.error,
            source: 'health_check'
          });
        }
      }
    }
  }

  log.info('Health check hoàn tất');
}

// ── Xử lý message từ main thread ──
parentPort.on('message', async (msg) => {
  if (msg.type === 'login') {
    // Login 1 agent theo yêu cầu
    const result = await loginAgent(msg.agentId, 'worker');
    parentPort.postMessage({
      type: 'login_result',
      agentId: msg.agentId,
      ...result,
      source: 'manual'
    });
  } else if (msg.type === 'health_check') {
    // Chạy health check theo yêu cầu
    await healthCheckAll();
  } else if (msg.type === 'shutdown') {
    if (_healthCheckTimer) clearInterval(_healthCheckTimer);
    if (_initialTimeout) clearTimeout(_initialTimeout);
    closeDb();
    process.exit(0);
  }
});

// ── Periodic health check ──
let _initialTimeout = null;
let _healthCheckTimer = null;

log.info('Login Worker đã khởi động');
log.info(`Health check mỗi ${HEALTH_CHECK_INTERVAL / 60000} phút`);

// Chạy health check lần đầu sau 10s (chờ server khởi động)
_initialTimeout = setTimeout(() => {
  healthCheckAll().catch(err => log.error('Health check lỗi:', err.message));
}, 10000);

// Lặp lại mỗi 30 phút
_healthCheckTimer = setInterval(() => {
  healthCheckAll().catch(err => log.error('Health check lỗi:', err.message));
}, HEALTH_CHECK_INTERVAL);
