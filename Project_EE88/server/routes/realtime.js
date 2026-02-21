/**
 * Realtime Polling Routes — API control cho polling + events
 *
 * Tất cả routes yêu cầu JWT + admin role
 *
 * GET  /api/admin/realtime/status   — Trạng thái polling
 * POST /api/admin/realtime/start    — Bắt đầu polling { intervalMs }
 * POST /api/admin/realtime/stop     — Dừng polling
 * GET  /api/admin/realtime/events   — Danh sách events (phân trang)
 * POST /api/admin/realtime/read     — Đánh dấu đã đọc { ids: [1,2,3] | 'all' }
 * POST /api/admin/realtime/clear    — Xoá events { beforeDate }
 * GET  /api/admin/realtime/unread-count — Đếm events chưa đọc
 */

const express = require('express');
const router = express.Router();
const { authMiddleware, adminOnly } = require('../middleware/auth');
const {
  startPolling,
  stopPolling,
  getStatus,
  getEvents,
  markRead,
  clearEvents
} = require('../services/realtimePoller');
const { getConnectionCount } = require('../services/wsServer');
const { isConnected: redisConnected } = require('../services/redisClient');

// Tất cả routes cần JWT + admin
router.use(authMiddleware, adminOnly);

// GET /status — trạng thái polling hiện tại
router.get('/status', (req, res) => {
  const status = getStatus();
  res.json({
    code: 0,
    data: {
      ...status,
      wsConnections: getConnectionCount(),
      redisConnected: redisConnected()
    }
  });
});

// POST /start — bắt đầu polling
router.post('/start', (req, res) => {
  const { intervalMs } = req.body || {};
  const ms = parseInt(intervalMs) || 10000;

  // Giới hạn interval: tối thiểu 5s, tối đa 60s
  const clampedMs = Math.max(5000, Math.min(60000, ms));

  startPolling(clampedMs);
  res.json({
    code: 0,
    msg: `Polling đã bắt đầu (${clampedMs / 1000}s)`,
    data: { intervalMs: clampedMs }
  });
});

// POST /stop — dừng polling
router.post('/stop', (req, res) => {
  stopPolling();
  res.json({ code: 0, msg: 'Polling đã dừng' });
});

// GET /events — danh sách events
router.get('/events', (req, res) => {
  const { page, limit, type, agent_id, unread } = req.query;
  const result = getEvents({
    page: parseInt(page) || 1,
    limit: Math.min(parseInt(limit) || 50, 200),
    eventType: type || undefined,
    agentId: agent_id ? parseInt(agent_id) : undefined,
    unreadOnly: unread === '1'
  });

  // Parse details JSON cho mỗi row
  for (const row of result.rows) {
    try {
      row.details = JSON.parse(row.details || '{}');
    } catch {
      row.details = {};
    }
  }

  res.json({ code: 0, data: result });
});

// POST /read — đánh dấu đã đọc
router.post('/read', (req, res) => {
  const { ids } = req.body || {};
  if (!ids) {
    return res.status(400).json({ code: -1, msg: 'Thiếu tham số ids' });
  }
  markRead(ids);
  res.json({ code: 0, msg: 'Đã đánh dấu đọc' });
});

// POST /clear — xoá events
router.post('/clear', (req, res) => {
  const { beforeDate } = req.body || {};
  clearEvents(beforeDate || undefined);
  res.json({
    code: 0,
    msg: beforeDate
      ? `Đã xoá events trước ${beforeDate}`
      : 'Đã xoá tất cả events'
  });
});

// GET /unread-count — đếm chưa đọc
router.get('/unread-count', (req, res) => {
  const { getDb } = require('../database/init');
  const db = getDb();
  const { cnt } = db
    .prepare('SELECT COUNT(*) as cnt FROM customer_events WHERE is_read = 0')
    .get();
  res.json({ code: 0, data: { count: cnt } });
});

module.exports = router;
