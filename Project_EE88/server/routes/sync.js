const express = require('express');
const { authMiddleware, adminOnly } = require('../middleware/auth');
const cacheManager = require('../services/cacheManager');
const cronSync = require('../services/cronSync');
const { createLogger } = require('../utils/logger');

const log = createLogger('sync-routes');
const router = express.Router();

// Tất cả sync routes cần auth + admin
router.use(authMiddleware, adminOnly);

// GET /api/admin/sync/status — Tổng quan cache
router.get('/sync/status', (req, res) => {
  const stats = cacheManager.getCacheStats();
  res.json({
    code: 0,
    data: {
      ...stats,
      syncing: cronSync.isSyncRunning(),
      cacheableEndpoints: cacheManager.getCacheableEndpoints()
    }
  });
});

// GET /api/admin/sync/logs — Danh sách sync logs (phân trang + filter)
router.get('/sync/logs', (req, res) => {
  const { page, limit, agent_id, endpoint, status, date } = req.query;
  const result = cacheManager.getSyncLogs({
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    agentId: agent_id ? parseInt(agent_id) : undefined,
    endpointKey: endpoint,
    status: status,
    dateStr: date
  });
  res.json({ code: 0, ...result });
});

// GET /api/admin/sync/cached-dates — Danh sách ngày đã cache
router.get('/sync/cached-dates', (req, res) => {
  const { agent_id, endpoint } = req.query;
  const dates = cacheManager.getCachedDates(
    agent_id ? parseInt(agent_id) : undefined,
    endpoint
  );
  res.json({ code: 0, data: dates, count: dates.length });
});

// POST /api/admin/sync/run — Chạy sync thủ công
router.post('/sync/run', async (req, res) => {
  const { date, agent_id, endpoint } = req.body;

  if (cronSync.isSyncRunning()) {
    return res.json({ code: -1, msg: 'Đang sync, vui lòng đợi...' });
  }

  log.info(`[${req.user.username}] Yêu cầu sync thủ công`, { date, agent_id, endpoint });

  // Chạy async, trả response ngay
  const syncDate = date || cacheManager.getYesterday();
  res.json({ code: 0, msg: `Đã bắt đầu sync ngày ${syncDate}` });

  try {
    const result = await cronSync.runSync(
      syncDate,
      agent_id ? parseInt(agent_id) : undefined,
      endpoint
    );
    log.ok(`Sync thủ công hoàn tất`, result.stats);
  } catch (err) {
    log.error(`Sync thủ công thất bại: ${err.message}`);
  }
});

// POST /api/admin/sync/clear — Xoá cache
router.post('/sync/clear', (req, res) => {
  const { agent_id, endpoint, date } = req.body;

  log.info(`[${req.user.username}] Yêu cầu xoá cache`, { agent_id, endpoint, date });

  const deleted = cacheManager.clearCache(
    agent_id ? parseInt(agent_id) : undefined,
    endpoint,
    date
  );

  res.json({ code: 0, msg: `Đã xoá ${deleted} bản ghi cache` });
});

module.exports = router;
