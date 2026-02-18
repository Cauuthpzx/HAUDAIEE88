const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const cronSync = require('../services/cronSync');
const { createLogger } = require('../utils/logger');

const log = createLogger('sync-routes');
const router = express.Router();

// ── SSE endpoint (auth via query param vì EventSource không set header được) ──
router.get('/sync/progress', (req, res, next) => {
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

  res.write('data: ' + JSON.stringify(cronSync.getSyncProgressSnapshot()) + '\n\n');

  function onProgress(data) {
    try { res.write('data: ' + JSON.stringify(data) + '\n\n'); } catch (e) {}
  }
  cronSync.syncEmitter.on('progress', onProgress);

  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch (e) {}
  }, 30000);

  req.on('close', () => {
    cronSync.syncEmitter.off('progress', onProgress);
    clearInterval(hb);
  });
});

// Tất cả routes còn lại cần auth + admin
router.use(authMiddleware, adminOnly);

// GET /api/admin/sync/status — Tổng quan
router.get('/sync/status', (req, res) => {
  try {
    const { getDb } = require('../database/init');
    const db = getDb();

    const agents = db.prepare('SELECT id, label, status FROM ee88_agents ORDER BY id').all();
    const agentStats = agents.map(agent => {
      let lockCount = 0;
      try {
        lockCount = db.prepare('SELECT COUNT(*) as cnt FROM sync_day_locks WHERE agent_id = ?').get(agent.id).cnt;
      } catch (e) { /* table may not exist yet */ }
      return { id: agent.id, label: agent.label, status: agent.status, lockedDays: lockCount };
    });

    res.json({
      code: 0,
      data: {
        agents: agentStats,
        syncing: cronSync.isSyncRunning(),
        totalDays: 65
      }
    });
  } catch (err) {
    log.error('sync/status error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// GET /api/admin/sync/progress-data — Progress snapshot (polling thay SSE)
router.get('/sync/progress-data', (req, res) => {
  res.json({ code: 0, data: cronSync.getSyncProgressSnapshot() });
});

// GET /api/admin/sync/locks/:agentId — Danh sách ngày đã khoá
router.get('/sync/locks/:agentId', (req, res) => {
  const locks = cronSync.getLockedDays(parseInt(req.params.agentId));
  res.json({ code: 0, data: locks, count: locks.length });
});

// POST /api/admin/sync/run — Sync 1 agent (thủ công)
router.post('/sync/run', async (req, res) => {
  const { agent_id } = req.body;
  if (!agent_id) return res.json({ code: -1, msg: 'Thiếu agent_id' });

  if (cronSync.isSyncRunning()) {
    return res.json({ code: -1, msg: 'Đang sync, vui lòng đợi...' });
  }

  log.info(`[${req.user.username}] Sync agent #${agent_id}`);
  res.json({ code: 0, msg: 'Đã bắt đầu sync' });

  try {
    await cronSync.syncAfterLogin(parseInt(agent_id));
    log.ok(`Sync agent #${agent_id} hoàn tất`);
  } catch (err) {
    log.error(`Sync agent #${agent_id} thất bại: ${err.message}`);
  }
});

// POST /api/admin/sync/run-all — Sync tất cả agents
router.post('/sync/run-all', async (req, res) => {
  if (cronSync.isSyncRunning()) {
    return res.json({ code: -1, msg: 'Đang sync, vui lòng đợi...' });
  }

  log.info(`[${req.user.username}] Sync toàn bộ agents`);
  res.json({ code: 0, msg: 'Đã bắt đầu sync toàn bộ' });

  try {
    await cronSync.syncAllAgents();
  } catch (err) {
    log.error(`Sync toàn bộ thất bại: ${err.message}`);
  }
});

// POST /api/admin/sync/clear — Xoá locks (cho phép re-sync)
router.post('/sync/clear', (req, res) => {
  const { agent_id } = req.body;
  if (!agent_id) return res.json({ code: -1, msg: 'Thiếu agent_id' });

  log.info(`[${req.user.username}] Xoá locks agent #${agent_id}`);
  const deleted = cronSync.clearLocks(parseInt(agent_id));
  res.json({ code: 0, msg: `Đã xoá ${deleted} khoá ngày`, deleted });
});

module.exports = router;
