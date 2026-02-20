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
const CACHE_TTL = 3 * 60 * 1000; // 3 phút
const MAX_CACHE = 200;

// GET /api/dashboard/stats?range=today|7d|30d  OR  ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
router.get('/stats', (req, res) => {
  const today = new Date();
  const todayStr = fmtDate(today);
  let range, startStr, endStr;

  // Custom date range takes priority
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (
    req.query.start_date &&
    req.query.end_date &&
    dateRe.test(req.query.start_date) &&
    dateRe.test(req.query.end_date)
  ) {
    startStr = req.query.start_date;
    endStr = req.query.end_date <= todayStr ? req.query.end_date : todayStr;
    range = startStr + ':' + endStr;
  } else {
    range = ['today', '7d', '30d'].includes(req.query.range)
      ? req.query.range
      : 'today';
    endStr = todayStr;
    if (range === '30d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 29);
      startStr = fmtDate(d);
    } else if (range === '7d') {
      const d = new Date(today);
      d.setDate(d.getDate() - 6);
      startStr = fmtDate(d);
    } else {
      startStr = todayStr;
    }
  }

  const cacheKey = req.user.id + ':' + range;
  const now = Date.now();

  const cached = cache.get(cacheKey);
  if (cached && now - cached.ts < CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const isAdmin = req.user.role === 'admin';
    const ph = agentIds.map(() => '?').join(',');

    const startTime = startStr + ' 00:00:00';
    const endTime = endStr + ' 23:59:59';

    const getData = db.transaction(() => {
      // 1-2. Members: total + new
      const members = db
        .prepare(
          `SELECT COUNT(*) as total,
                SUM(CASE WHEN register_time >= ? AND register_time <= ? THEN 1 ELSE 0 END) as new_cnt
         FROM data_members WHERE agent_id IN (${ph})`
        )
        .get(startTime, endTime, ...agentIds);

      // 3. Active members: DISTINCT uid có cược trong khoảng thời gian (lottery UNION third)
      const activeMembers = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM (
             SELECT DISTINCT uid FROM data_report_lottery
             WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
             UNION
             SELECT DISTINCT uid FROM data_report_third
             WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
           )`
        )
        .get(...agentIds, startStr, endStr, ...agentIds, startStr, endStr);

      // 4. Nạp tiền (từ dữ liệu tổng hợp report_funds)
      const deposits = db
        .prepare(
          `SELECT COALESCE(SUM(deposit_amount), 0) as total
         FROM data_report_funds
         WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?`
        )
        .get(...agentIds, startStr, endStr);

      // 5. Rút tiền (từ dữ liệu tổng hợp report_funds)
      const withdrawals = db
        .prepare(
          `SELECT COALESCE(SUM(withdrawal_amount), 0) as total
         FROM data_report_funds
         WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?`
        )
        .get(...agentIds, startStr, endStr);

      // 6. Thắng/thua cược bên thứ 3
      const betOrders = db
        .prepare(
          `SELECT COALESCE(SUM(bet_amount), 0) as bet,
                COALESCE(SUM(prize), 0) as prize,
                COALESCE(SUM(win_lose), 0) as win_lose
         FROM data_bet_orders
         WHERE agent_id IN (${ph}) AND bet_time >= ? AND bet_time <= ?`
        )
        .get(...agentIds, startTime, endTime);

      // 7. Thắng/thua xổ số
      // date_key lưu dạng "YYYY-MM-DD|YYYY-MM-DD", dùng SUBSTR lấy ngày đầu
      const lottery = db
        .prepare(
          `SELECT COALESCE(SUM(bet_amount), 0) as bet,
                COALESCE(SUM(prize), 0) as prize,
                COALESCE(SUM(win_lose), 0) as win_lose
         FROM data_report_lottery
         WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?`
        )
        .get(...agentIds, startStr, endStr);

      // 8. Xu hướng nạp/rút theo ngày (cho biểu đồ)
      // date_key lưu "YYYY-MM-DD|YYYY-MM-DD", SUBSTR lấy ngày để group đúng
      const dailyTrend = db
        .prepare(
          `SELECT SUBSTR(date_key, 1, 10) as date_key,
                COALESCE(SUM(deposit_amount), 0) as deposit,
                COALESCE(SUM(withdrawal_amount), 0) as withdrawal
         FROM data_report_funds
         WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
         GROUP BY SUBSTR(date_key, 1, 10) ORDER BY SUBSTR(date_key, 1, 10)`
        )
        .all(...agentIds, startStr, endStr);

      // 9. First-deposit members: LEFT JOIN thay NOT IN (nhanh hơn)
      const firstDeposit = db
        .prepare(
          `SELECT COUNT(DISTINCT d1.uid) as cnt
         FROM data_deposits d1
         LEFT JOIN data_deposits d2
           ON d2.agent_id IN (${ph}) AND d2.uid = d1.uid
              AND (d2.status = 1 OR d2.status = 'Hoàn tất') AND d2.create_time < ?
         WHERE d1.agent_id IN (${ph})
           AND (d1.status = 1 OR d1.status = 'Hoàn tất')
           AND d1.create_time >= ? AND d1.create_time <= ?
           AND d2.uid IS NULL`
        )
        .get(...agentIds, startTime, ...agentIds, startTime, endTime).cnt;

      // 10. Per-agent overview (admin only) — luôn dùng tháng hiện tại
      let perAgent = null;
      let agentMonth = null;
      if (isAdmin) {
        const monthStart = todayStr.substring(0, 8) + '01';
        const monthStartTime = monthStart + ' 00:00:00';
        const todayStart = todayStr + ' 00:00:00';
        const todayEnd = todayStr + ' 23:59:59';
        agentMonth = todayStr.substring(0, 7);

        // a) Agent info
        const agents = db
          .prepare(
            `SELECT id, label, ee88_username FROM ee88_agents
             WHERE id IN (${ph}) AND is_deleted = 0 ORDER BY id`
          )
          .all(...agentIds);

        // b) Daily online: UNION uid từ lottery + third, COUNT DISTINCT per day
        const dailyOnlineRows = db
          .prepare(
            `SELECT agent_id, day_key, COUNT(DISTINCT uid) as cnt FROM (
               SELECT agent_id, SUBSTR(date_key, 1, 10) as day_key, uid
                 FROM data_report_lottery
                 WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
               UNION
               SELECT agent_id, SUBSTR(date_key, 1, 10) as day_key, uid
                 FROM data_report_third
                 WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
             ) GROUP BY agent_id, day_key`
          )
          .all(
            ...agentIds,
            monthStart,
            todayStr,
            ...agentIds,
            monthStart,
            todayStr
          );

        // c) Today new customers: uid lần đầu xuất hiện hôm nay
        //    (có trong lottery/third/deposits hôm nay, KHÔNG có trước hôm nay)
        const todayNewRows = db
          .prepare(
            `WITH today_uids AS (
               SELECT DISTINCT agent_id, uid FROM data_report_lottery
               WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) = ?
               UNION
               SELECT DISTINCT agent_id, uid FROM data_report_third
               WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) = ?
               UNION
               SELECT DISTINCT agent_id, uid FROM data_deposits
               WHERE agent_id IN (${ph}) AND SUBSTR(create_time, 1, 10) = ?
             ),
             old_uids AS (
               SELECT DISTINCT agent_id, uid FROM data_report_lottery
               WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) < ?
               UNION
               SELECT DISTINCT agent_id, uid FROM data_report_third
               WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) < ?
               UNION
               SELECT DISTINCT agent_id, uid FROM data_deposits
               WHERE agent_id IN (${ph}) AND SUBSTR(create_time, 1, 10) < ?
             )
             SELECT t.agent_id, COUNT(*) as cnt
             FROM today_uids t
             LEFT JOIN old_uids o ON o.agent_id = t.agent_id AND o.uid = t.uid
             WHERE o.uid IS NULL
             GROUP BY t.agent_id`
          )
          .all(
            ...agentIds,
            todayStr,
            ...agentIds,
            todayStr,
            ...agentIds,
            todayStr,
            ...agentIds,
            todayStr,
            ...agentIds,
            todayStr,
            ...agentIds,
            todayStr
          );

        // d) Today lottery bet
        const todayLotteryRows = db
          .prepare(
            `SELECT agent_id, COALESCE(SUM(bet_amount), 0) as total
             FROM data_report_lottery
             WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) = ?
             GROUP BY agent_id`
          )
          .all(...agentIds, todayStr);

        // e) Today 3rd party bet
        const todayThirdRows = db
          .prepare(
            `SELECT agent_id, COALESCE(SUM(t_bet_amount), 0) as total
             FROM data_report_third
             WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) = ?
             GROUP BY agent_id`
          )
          .all(...agentIds, todayStr);

        // f) Monthly lottery bet + W/L (gộp 1 query)
        const monthLotteryRows = db
          .prepare(
            `SELECT agent_id,
                    COALESCE(SUM(bet_amount), 0) as bet,
                    COALESCE(SUM(win_lose), 0) as wl
             FROM data_report_lottery
             WHERE agent_id IN (${ph})
               AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
             GROUP BY agent_id`
          )
          .all(...agentIds, monthStart, todayStr);

        // g) Monthly 3rd party bet
        const monthThirdBetRows = db
          .prepare(
            `SELECT agent_id, COALESCE(SUM(t_bet_amount), 0) as bet
             FROM data_report_third
             WHERE agent_id IN (${ph})
               AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
             GROUP BY agent_id`
          )
          .all(...agentIds, monthStart, todayStr);

        // h) Monthly 3rd party W/L (bet_orders, dùng bet_time)
        const monthThirdWLRows = db
          .prepare(
            `SELECT agent_id, COALESCE(SUM(win_lose), 0) as wl
             FROM data_bet_orders
             WHERE agent_id IN (${ph}) AND bet_time >= ? AND bet_time <= ?
             GROUP BY agent_id`
          )
          .all(...agentIds, monthStartTime, todayEnd);

        // i) Today deposit (from aggregated report_funds)
        const todayDepRows = db
          .prepare(
            `SELECT agent_id, COALESCE(SUM(deposit_amount), 0) as total
             FROM data_report_funds
             WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) = ?
             GROUP BY agent_id`
          )
          .all(...agentIds, todayStr);

        // j) Monthly deposit (from aggregated report_funds)
        const monthDepRows = db
          .prepare(
            `SELECT agent_id, COALESCE(SUM(deposit_amount), 0) as total
             FROM data_report_funds
             WHERE agent_id IN (${ph})
               AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
             GROUP BY agent_id`
          )
          .all(...agentIds, monthStart, todayStr);

        // Merge: build lookup maps
        const toMap = (rows, fn) => {
          const m = {};
          rows.forEach((r) => {
            m[r.agent_id] = fn(r);
          });
          return m;
        };

        const dailyMap = {};
        dailyOnlineRows.forEach((r) => {
          if (!dailyMap[r.agent_id]) dailyMap[r.agent_id] = {};
          dailyMap[r.agent_id][r.day_key] = r.cnt;
        });

        const todayNewMap = toMap(todayNewRows, (r) => r.cnt);
        const todayLotMap = toMap(todayLotteryRows, (r) => r.total);
        const todayThdMap = toMap(todayThirdRows, (r) => r.total);
        const mLotMap = {};
        monthLotteryRows.forEach((r) => {
          mLotMap[r.agent_id] = { bet: r.bet, wl: r.wl };
        });
        const mThdBetMap = toMap(monthThirdBetRows, (r) => r.bet);
        const mThdWLMap = toMap(monthThirdWLRows, (r) => r.wl);
        const todayDepMap = toMap(todayDepRows, (r) => r.total);
        const monthDepMap = toMap(monthDepRows, (r) => r.total);

        perAgent = agents.map((a) => {
          const ml = mLotMap[a.id] || { bet: 0, wl: 0 };
          return {
            label: a.label,
            ee88Username: a.ee88_username,
            dailyOnline: dailyMap[a.id] || {},
            todayNewCustomers: todayNewMap[a.id] || 0,
            todayLotteryBet: todayLotMap[a.id] || 0,
            todayThirdBet: todayThdMap[a.id] || 0,
            monthlyLotteryBet: ml.bet,
            monthlyThirdBet: mThdBetMap[a.id] || 0,
            todayDeposit: todayDepMap[a.id] || 0,
            monthlyDeposit: monthDepMap[a.id] || 0,
            lotteryWL: ml.wl,
            thirdWL: mThdWLMap[a.id] || 0
          };
        });
      }

      return {
        members,
        activeMembers,
        firstDeposit,
        deposits,
        withdrawals,
        betOrders,
        lottery,
        dailyTrend,
        perAgent,
        agentMonth
      };
    });

    const d = getData();

    const result = {
      code: 0,
      data: {
        range,
        startDate: startStr,
        endDate: endStr,
        members: {
          total: d.members.total,
          new: d.members.new_cnt,
          active: d.activeMembers.cnt,
          firstDeposit: d.firstDeposit
        },
        deposits: { amount: d.deposits.total },
        withdrawals: { amount: d.withdrawals.total },
        winLoss: {
          thirdParty: {
            bet: d.betOrders.bet,
            prize: d.betOrders.prize,
            winLose: d.betOrders.win_lose
          },
          lottery: {
            bet: d.lottery.bet,
            prize: d.lottery.prize,
            winLose: d.lottery.win_lose
          }
        },
        dailyTrend: d.dailyTrend,
        perAgent: d.perAgent,
        agentMonth: d.agentMonth
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
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

module.exports = router;
