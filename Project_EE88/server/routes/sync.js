const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const cronSync = require('../services/cronSync');
const dataStore = require('../services/dataStore');
const { createLogger } = require('../utils/logger');
const log = createLogger('sync-routes');
const router = express.Router();

function sseData(data) {
  var json = JSON.stringify(data);
  var encoded = Buffer.from(json).toString('base64');
  return 'data: ' + JSON.stringify({ _enc: encoded }) + '\n\n';
}

// ── SSE endpoint (auth via query param vì EventSource không set header được) ──
router.get(
  '/sync/progress',
  (req, res, next) => {
    if (!req.headers.authorization && req.query.token) {
      req.headers.authorization = 'Bearer ' + req.query.token;
    }
    next();
  },
  authMiddleware,
  adminOnly,
  (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Gửi snapshot ngay lập tức
    res.write(sseData(cronSync.getSyncProgressSnapshot()));

    function onProgress(data) {
      try {
        res.write(sseData(data));
      } catch (e) {
        cleanup();
      }
    }
    cronSync.syncEmitter.on('progress', onProgress);

    const hb = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch (e) {
        cleanup();
      }
    }, 30000);

    // Auto-close sau 15 phút (sync có thể mất 11 phút, client sẽ tự reconnect)
    const maxAge = setTimeout(() => cleanup(), 15 * 60 * 1000);

    let cleaned = false;
    function cleanup() {
      if (cleaned) return;
      cleaned = true;
      cronSync.syncEmitter.off('progress', onProgress);
      clearInterval(hb);
      clearTimeout(maxAge);
      try {
        res.end();
      } catch (e) {}
    }

    req.on('close', cleanup);
    res.on('error', cleanup);
  }
);

// Tất cả routes còn lại cần auth + admin
router.use(authMiddleware, adminOnly);

// GET /api/admin/sync/status — Tổng quan (bao gồm row counts tất cả endpoints)
router.get('/sync/status', (req, res) => {
  try {
    const { getDb } = require('../database/init');
    const db = getDb();

    const agents = db
      .prepare('SELECT id, label, status FROM ee88_agents ORDER BY id')
      .all();

    // Bảng → endpoint mapping cho row count
    const EP_TABLES = {};
    for (const [ep, mapping] of Object.entries(dataStore.COLUMN_MAP)) {
      EP_TABLES[ep] = mapping.table;
    }

    const agentStats = agents.map((agent) => {
      let lockCount = 0;
      let lastSyncAt = null;
      try {
        lockCount = db
          .prepare(
            'SELECT COUNT(*) as cnt FROM sync_day_locks WHERE agent_id = ?'
          )
          .get(agent.id).cnt;
      } catch (e) {}
      try {
        lastSyncAt = db
          .prepare(
            'SELECT MAX(locked_at) as t FROM sync_day_locks WHERE agent_id = ?'
          )
          .get(agent.id).t;
      } catch (e) {}

      // Row counts cho TẤT CẢ endpoints
      const rows = {};
      for (const [ep, table] of Object.entries(EP_TABLES)) {
        try {
          rows[ep] = db
            .prepare(`SELECT COUNT(*) as cnt FROM ${table} WHERE agent_id = ?`)
            .get(agent.id).cnt;
        } catch (e) {
          rows[ep] = 0;
        }
      }

      return {
        id: agent.id,
        label: agent.label,
        status: agent.status,
        lockedDays: lockCount,
        lastSyncAt,
        rows
      };
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

// GET /api/admin/sync/progress-data — Progress snapshot (polling fallback)
router.get('/sync/progress-data', (req, res) => {
  res.json({ code: 0, data: cronSync.getSyncProgressSnapshot() });
});

// GET /api/admin/sync/locks/:agentId — Danh sách ngày đã khoá
router.get('/sync/locks/:agentId', (req, res) => {
  const locks = cronSync.getLockedDays(parseInt(req.params.agentId));
  res.json({ code: 0, data: locks, count: locks.length });
});

// POST /api/admin/sync/run — Sync 1 agent (cho phép sync agent khác song song)
router.post('/sync/run', async (req, res) => {
  const { agent_id } = req.body;
  if (!agent_id) return res.json({ code: -1, msg: 'Thiếu agent_id' });

  // Check per-agent lock thay vì global — cho phép sync nhiều agent song song
  if (cronSync.isAgentSyncing(parseInt(agent_id))) {
    return res.json({ code: -1, msg: 'Agent này đang sync, vui lòng đợi...' });
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

// POST /api/admin/sync/run-all — Sync tất cả agents (song song)
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
