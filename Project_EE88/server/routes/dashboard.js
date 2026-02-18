const express = require('express');
const { getDb } = require('../database/init');
const { authMiddleware } = require('../middleware/auth');
const { permissionMiddleware } = require('../middleware/permission');
const { createLogger } = require('../utils/logger');

const log = createLogger('dashboard');
const router = express.Router();

// Auth + permission (không admin-only — tất cả users đều xem được)
router.use(authMiddleware, permissionMiddleware);

// ── Per-user cache: Map<"userId:range", { data, ts }> ──
const cache = new Map();
const CACHE_TTL = 60 * 1000;
const MAX_CACHE = 200;

// GET /api/dashboard/stats?range=today|7d|30d
router.get('/stats', (req, res) => {
  const range = ['today', '7d', '30d'].includes(req.query.range) ? req.query.range : 'today';
  const cacheKey = req.user.id + ':' + range;
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && (now - cached.ts) < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const isAdmin = req.user.role === 'admin';
    const ph = agentIds.map(() => '?').join(',');

    // Date range
    const today = new Date();
    const todayStr = fmtDate(today);
    let startStr;
    if (range === '30d') {
      const d = new Date(today); d.setDate(d.getDate() - 29);
      startStr = fmtDate(d);
    } else if (range === '7d') {
      const d = new Date(today); d.setDate(d.getDate() - 6);
      startStr = fmtDate(d);
    } else {
      startStr = todayStr;
    }

    const startTime = startStr + ' 00:00:00';
    const endTime = todayStr + ' 23:59:59';

    const getData = db.transaction(() => {
      // 1. Tổng hội viên
      const totalMembers = db.prepare(
        `SELECT COUNT(*) as cnt FROM data_members WHERE agent_id IN (${ph})`
      ).get(...agentIds).cnt;

      // 2. Hội viên mới (registered trong range)
      const newMembers = db.prepare(
        `SELECT COUNT(*) as cnt FROM data_members
         WHERE agent_id IN (${ph}) AND register_time >= ? AND register_time <= ?`
      ).get(...agentIds, startTime, endTime).cnt;

      // 3. Đang hoạt động (logged in trong range)
      const activeMembers = db.prepare(
        `SELECT COUNT(*) as cnt FROM data_members
         WHERE agent_id IN (${ph}) AND last_login_time >= ?`
      ).get(...agentIds, startTime).cnt;

      // 4. Nạp tiền (completed deposits)
      const deposits = db.prepare(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(true_amount), 0) as total
         FROM data_deposits
         WHERE agent_id IN (${ph}) AND create_time >= ? AND create_time <= ? AND status = 1`
      ).get(...agentIds, startTime, endTime);

      // 5. Rút tiền
      const withdrawals = db.prepare(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(true_amount), 0) as total
         FROM data_withdrawals
         WHERE agent_id IN (${ph}) AND create_time >= ? AND create_time <= ?`
      ).get(...agentIds, startTime, endTime);

      // 6. Thắng/thua cược bên thứ 3
      const betOrders = db.prepare(
        `SELECT COALESCE(SUM(bet_amount), 0) as bet,
                COALESCE(SUM(prize), 0) as prize,
                COALESCE(SUM(win_lose), 0) as win_lose
         FROM data_bet_orders
         WHERE agent_id IN (${ph}) AND bet_time >= ? AND bet_time <= ?`
      ).get(...agentIds, startTime, endTime);

      // 7. Thắng/thua xổ số
      const lottery = db.prepare(
        `SELECT COALESCE(SUM(bet_amount), 0) as bet,
                COALESCE(SUM(prize), 0) as prize,
                COALESCE(SUM(win_lose), 0) as win_lose
         FROM data_report_lottery
         WHERE agent_id IN (${ph}) AND date_key >= ? AND date_key <= ?`
      ).get(...agentIds, startStr, todayStr);

      // 8. Xu hướng nạp/rút theo ngày (cho biểu đồ)
      const dailyTrend = db.prepare(
        `SELECT date_key,
                COALESCE(SUM(deposit_amount), 0) as deposit,
                COALESCE(SUM(withdrawal_amount), 0) as withdrawal
         FROM data_report_funds
         WHERE agent_id IN (${ph}) AND date_key >= ? AND date_key <= ?
         GROUP BY date_key ORDER BY date_key`
      ).all(...agentIds, startStr, todayStr);

      // 9. Per-agent breakdown (admin only)
      let perAgent = null;
      if (isAdmin) {
        perAgent = db.prepare(
          `SELECT a.id, a.label,
                  (SELECT COUNT(*) FROM data_members WHERE agent_id = a.id) as members,
                  (SELECT COALESCE(SUM(deposit_amount), 0) FROM data_report_funds
                    WHERE agent_id = a.id AND date_key >= ? AND date_key <= ?) as deposit,
                  (SELECT COALESCE(SUM(withdrawal_amount), 0) FROM data_report_funds
                    WHERE agent_id = a.id AND date_key >= ? AND date_key <= ?) as withdrawal
           FROM ee88_agents a WHERE a.id IN (${ph}) ORDER BY a.id`
        ).all(startStr, todayStr, startStr, todayStr, ...agentIds);
      }

      return { totalMembers, newMembers, activeMembers, deposits, withdrawals,
               betOrders, lottery, dailyTrend, perAgent };
    });

    const d = getData();

    const result = {
      code: 0,
      data: {
        range,
        startDate: startStr,
        endDate: todayStr,
        members: { total: d.totalMembers, new: d.newMembers, active: d.activeMembers },
        deposits: { count: d.deposits.cnt, amount: d.deposits.total },
        withdrawals: { count: d.withdrawals.cnt, amount: d.withdrawals.total },
        winLoss: {
          thirdParty: { bet: d.betOrders.bet, prize: d.betOrders.prize, winLose: d.betOrders.win_lose },
          lottery: { bet: d.lottery.bet, prize: d.lottery.prize, winLose: d.lottery.win_lose }
        },
        dailyTrend: d.dailyTrend,
        perAgent: d.perAgent
      }
    };

    // Cache
    if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    cache.set(cacheKey, { data: result, ts: now });

    res.json(result);
  } catch (err) {
    log.error('dashboard/stats error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

function fmtDate(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

module.exports = router;
