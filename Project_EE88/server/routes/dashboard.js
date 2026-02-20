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

      // 6. Thắng/thua cược bên thứ 3 (dùng data_report_third — nguồn chính thức)
      const thirdParty = db
        .prepare(
          `SELECT COALESCE(SUM(t_bet_amount), 0) as bet,
                COALESCE(SUM(t_prize), 0) as prize,
                COALESCE(SUM(t_win_lose), 0) as win_lose
         FROM data_report_third
         WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?`
        )
        .get(...agentIds, startStr, endStr);

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

        // c) Today valid new customers:
        //    A) uid lần đầu đặt cược hôm nay (mới xuất hiện trong lottery/third)
        //    B) uid có nạp lần đầu hôm nay (first_deposit_time = today, mới hoặc cũ)
        //    C) uid lần đầu trong data + balance > 10,000
        const todayNewRows = db
          .prepare(
            `WITH old_bet_uids AS (
               SELECT DISTINCT agent_id, uid FROM data_report_lottery
               WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) < ?
               UNION
               SELECT DISTINCT agent_id, uid FROM data_report_third
               WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) < ?
             ),
             old_data_uids AS (
               SELECT agent_id, uid FROM old_bet_uids
               UNION
               SELECT DISTINCT agent_id, uid FROM data_deposits
               WHERE agent_id IN (${ph}) AND SUBSTR(create_time, 1, 10) < ?
             )
             SELECT agent_id, COUNT(*) as cnt FROM (
               -- A: New bettor today (first time in lottery/third)
               SELECT t.agent_id, t.uid FROM (
                 SELECT DISTINCT agent_id, uid FROM data_report_lottery
                 WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) = ?
                 UNION
                 SELECT DISTINCT agent_id, uid FROM data_report_third
                 WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) = ?
               ) t
               LEFT JOIN old_bet_uids o ON o.agent_id = t.agent_id AND o.uid = t.uid
               WHERE o.uid IS NULL
               UNION
               -- B: First deposit today (new or existing member)
               SELECT agent_id, uid FROM data_members
               WHERE agent_id IN (${ph}) AND SUBSTR(first_deposit_time, 1, 10) = ?
               UNION
               -- C: New in data today + balance > 10,000
               SELECT t2.agent_id, t2.uid FROM (
                 SELECT DISTINCT agent_id, uid FROM data_deposits
                 WHERE agent_id IN (${ph}) AND SUBSTR(create_time, 1, 10) = ?
               ) t2
               LEFT JOIN old_data_uids o2 ON o2.agent_id = t2.agent_id AND o2.uid = t2.uid
               WHERE o2.uid IS NULL
                 AND EXISTS (
                   SELECT 1 FROM data_members m
                   WHERE m.agent_id = t2.agent_id AND m.uid = t2.uid AND m.balance > 10000
                 )
             ) GROUP BY agent_id`
          )
          .all(
            // old_bet_uids: 2 × (agentIds + todayStr)
            ...agentIds,
            todayStr,
            ...agentIds,
            todayStr,
            // old_data_uids: 1 × (agentIds + todayStr)
            ...agentIds,
            todayStr,
            // A: new bettors (2 × agentIds + todayStr)
            ...agentIds,
            todayStr,
            ...agentIds,
            todayStr,
            // B: first deposit (agentIds + todayStr)
            ...agentIds,
            todayStr,
            // C: new deposit + balance (agentIds + todayStr)
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

        // h) Monthly 3rd party W/L (report_third — nguồn chính thức)
        const monthThirdWLRows = db
          .prepare(
            `SELECT agent_id, COALESCE(SUM(t_win_lose), 0) as wl
             FROM data_report_third
             WHERE agent_id IN (${ph})
               AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
             GROUP BY agent_id`
          )
          .all(...agentIds, monthStart, todayStr);

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
            agentId: a.id,
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
        thirdParty,
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
            bet: d.thirdParty.bet,
            prize: d.thirdParty.prize,
            winLose: d.thirdParty.win_lose
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

// ═══════════════════════════════════════
// ── Helper: parse date range từ query ──
// ═══════════════════════════════════════

function parseDateRange(query) {
  const today = new Date();
  const todayStr = fmtDate(today);
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  let startStr, endStr;
  if (
    query.start_date &&
    query.end_date &&
    dateRe.test(query.start_date) &&
    dateRe.test(query.end_date)
  ) {
    startStr = query.start_date;
    endStr = query.end_date <= todayStr ? query.end_date : todayStr;
  } else {
    startStr = todayStr;
    endStr = todayStr;
  }
  return { startStr, endStr };
}

// ═══════════════════════════════════════
// ── GET /api/dashboard/revenue ──
// ═══════════════════════════════════════

router.get('/revenue', (req, res) => {
  const { startStr, endStr } = parseDateRange(req.query);
  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const ph = agentIds.map(() => '?').join(',');

    // Tính kỳ trước (cùng số ngày)
    const days =
      Math.round((new Date(endStr) - new Date(startStr)) / 86400000) + 1;
    const prevEnd = new Date(startStr);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    const prevStartStr = fmtDate(prevStart);
    const prevEndStr = fmtDate(prevEnd);

    function queryRevenue(s, e) {
      const lotteryWL = db
        .prepare(
          `SELECT agent_id, COALESCE(SUM(win_lose), 0) as wl
         FROM data_report_lottery WHERE agent_id IN (${ph})
         AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
         GROUP BY agent_id`
        )
        .all(...agentIds, s, e);

      const thirdWL = db
        .prepare(
          `SELECT agent_id, COALESCE(SUM(t_win_lose), 0) as wl
         FROM data_report_third WHERE agent_id IN (${ph})
         AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
         GROUP BY agent_id`
        )
        .all(...agentIds, s, e);

      const funds = db
        .prepare(
          `SELECT agent_id,
                COALESCE(SUM(promotion), 0) as promotion,
                COALESCE(SUM(third_rebate), 0) as third_rebate
         FROM data_report_funds WHERE agent_id IN (${ph})
         AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
         GROUP BY agent_id`
        )
        .all(...agentIds, s, e);

      return { lotteryWL, thirdWL, funds };
    }

    const agents = db
      .prepare(
        `SELECT id, label, ee88_username FROM ee88_agents
       WHERE id IN (${ph}) AND is_deleted = 0 ORDER BY id`
      )
      .all(...agentIds);

    const cur = queryRevenue(startStr, endStr);
    const prev = queryRevenue(prevStartStr, prevEndStr);

    function buildMap(rows, fn) {
      const m = {};
      rows.forEach((r) => {
        m[r.agent_id] = fn(r);
      });
      return m;
    }

    function buildResult(q) {
      const lotMap = buildMap(q.lotteryWL, (r) => r.wl);
      const thdMap = buildMap(q.thirdWL, (r) => r.wl);
      const fundsMap = {};
      q.funds.forEach((r) => {
        fundsMap[r.agent_id] = {
          promotion: r.promotion,
          thirdRebate: r.third_rebate
        };
      });

      let totalLot = 0,
        totalThd = 0,
        totalPro = 0,
        totalReb = 0;
      const perAgent = agents.map((a) => {
        const lw = lotMap[a.id] || 0;
        const tw = thdMap[a.id] || 0;
        const f = fundsMap[a.id] || { promotion: 0, thirdRebate: 0 };
        const revenue = -(lw + tw + f.promotion + f.thirdRebate);
        totalLot += lw;
        totalThd += tw;
        totalPro += f.promotion;
        totalReb += f.thirdRebate;
        return {
          agentId: a.id,
          label: a.label,
          ee88Username: a.ee88_username,
          lotteryWL: lw,
          thirdWL: tw,
          promotion: f.promotion,
          thirdRebate: f.thirdRebate,
          revenue
        };
      });
      return {
        perAgent,
        totals: {
          lotteryWL: totalLot,
          thirdWL: totalThd,
          promotion: totalPro,
          thirdRebate: totalReb,
          revenue: -(totalLot + totalThd + totalPro + totalReb)
        }
      };
    }

    const curResult = buildResult(cur);
    const prevResult = buildResult(prev);

    // So sánh kỳ trước
    let comparison = 'SAME';
    if (prevResult.totals.revenue === 0 && curResult.totals.revenue !== 0)
      comparison = 'NEW';
    else if (curResult.totals.revenue > prevResult.totals.revenue)
      comparison = 'UP';
    else if (curResult.totals.revenue < prevResult.totals.revenue)
      comparison = 'DOWN';

    const changePct =
      prevResult.totals.revenue !== 0
        ? ((curResult.totals.revenue - prevResult.totals.revenue) /
            Math.abs(prevResult.totals.revenue)) *
          100
        : 0;

    res.json({
      code: 0,
      data: {
        startDate: startStr,
        endDate: endStr,
        perAgent: curResult.perAgent,
        totals: curResult.totals,
        prevTotals: prevResult.totals,
        comparison,
        changePct: Math.round(changePct * 10) / 10
      }
    });
  } catch (err) {
    log.error('dashboard/revenue error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// ═══════════════════════════════════════
// ── GET /api/dashboard/customer-analysis ──
// ═══════════════════════════════════════

router.get('/customer-analysis', (req, res) => {
  const { startStr, endStr } = parseDateRange(req.query);
  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const ph = agentIds.map(() => '?').join(',');

    const getData = db.transaction(() => {
      // Tổng hội viên
      const totalMembers = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM data_members WHERE agent_id IN (${ph})`
        )
        .get(...agentIds).cnt;

      // Hoạt động trong khoảng
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
        .get(...agentIds, startStr, endStr, ...agentIds, startStr, endStr).cnt;

      // Tài chính
      const finance = db
        .prepare(
          `SELECT COALESCE(SUM(deposit_amount), 0) as totalDeposit,
                COALESCE(SUM(withdrawal_amount), 0) as totalWithdrawal
         FROM data_report_funds WHERE agent_id IN (${ph})
         AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?`
        )
        .get(...agentIds, startStr, endStr);

      const lotteryWL = db
        .prepare(
          `SELECT COALESCE(SUM(win_lose), 0) as wl FROM data_report_lottery
         WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?`
        )
        .get(...agentIds, startStr, endStr).wl;

      const thirdWL = db
        .prepare(
          `SELECT COALESCE(SUM(t_win_lose), 0) as wl FROM data_report_third
         WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?`
        )
        .get(...agentIds, startStr, endStr).wl;

      // Phân loại theo mức nạp (6 nhóm)
      const tiers = db
        .prepare(
          `SELECT
           CASE
             WHEN COALESCE(deposit_money, 0) = 0 THEN 'zero'
             WHEN deposit_money < 1000000 THEN 'under1M'
             WHEN deposit_money < 5000000 THEN '1to5M'
             WHEN deposit_money < 10000000 THEN '5to10M'
             WHEN deposit_money < 50000000 THEN '10to50M'
             ELSE 'over50M'
           END as tier, COUNT(*) as cnt
         FROM data_members WHERE agent_id IN (${ph})
         GROUP BY tier`
        )
        .all(...agentIds);

      // Phân loại thắng/thua per-uid
      const wlSegRows = db
        .prepare(
          `SELECT
           CASE
             WHEN total_wl < 0 THEN 'losers'
             WHEN total_wl > 0 THEN 'winners'
             ELSE 'draw'
           END as seg, COUNT(*) as cnt
         FROM (
           SELECT uid, COALESCE(l_wl, 0) + COALESCE(t_wl, 0) as total_wl FROM (
             SELECT uid, SUM(win_lose) as l_wl FROM data_report_lottery
             WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
             GROUP BY uid
           ) ll LEFT JOIN (
             SELECT uid as t_uid, SUM(t_win_lose) as t_wl FROM data_report_third
             WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
             GROUP BY uid
           ) tt ON ll.uid = tt.t_uid
           UNION ALL
           SELECT t_uid as uid, COALESCE(t_wl, 0) as total_wl FROM (
             SELECT uid as t_uid, SUM(t_win_lose) as t_wl FROM data_report_third
             WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
             GROUP BY uid
           ) tt2 WHERE t_uid NOT IN (
             SELECT DISTINCT uid FROM data_report_lottery
             WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
           )
         ) GROUP BY seg`
        )
        .all(
          ...agentIds,
          startStr,
          endStr,
          ...agentIds,
          startStr,
          endStr,
          ...agentIds,
          startStr,
          endStr,
          ...agentIds,
          startStr,
          endStr
        );

      // Chất lượng
      const deposited = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM data_members
         WHERE agent_id IN (${ph}) AND COALESCE(deposit_money, 0) > 0`
        )
        .get(...agentIds).cnt;

      const multiDeposit = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM data_members
         WHERE agent_id IN (${ph}) AND COALESCE(deposit_money, 0) > 0
         AND EXISTS (SELECT 1 FROM data_deposits d WHERE d.agent_id = data_members.agent_id AND d.uid = data_members.uid AND (d.status = 1 OR d.status = 'Hoàn tất') GROUP BY d.uid HAVING COUNT(*) > 1)`
        )
        .get(...agentIds).cnt;

      const highValue = db
        .prepare(
          `SELECT COUNT(*) as cnt FROM data_members
         WHERE agent_id IN (${ph}) AND COALESCE(deposit_money, 0) >= 10000000`
        )
        .get(...agentIds).cnt;

      return {
        totalMembers,
        activeMembers,
        finance,
        lotteryWL,
        thirdWL,
        tiers,
        wlSegRows,
        deposited,
        multiDeposit,
        highValue
      };
    });

    const d = getData();
    const inactive = d.totalMembers - d.activeMembers;
    const depositRate =
      d.totalMembers > 0
        ? Math.round((d.deposited / d.totalMembers) * 1000) / 10
        : 0;

    const tierMap = {};
    d.tiers.forEach((t) => {
      tierMap[t.tier] = t.cnt;
    });

    const wlSeg = { winners: 0, losers: 0, draw: 0 };
    d.wlSegRows.forEach((r) => {
      wlSeg[r.seg] = r.cnt;
    });

    res.json({
      code: 0,
      data: {
        startDate: startStr,
        endDate: endStr,
        summary: {
          total: d.totalMembers,
          active: d.activeMembers,
          inactive,
          deposited: d.deposited,
          depositRate,
          totalDeposit: d.finance.totalDeposit,
          totalWithdrawal: d.finance.totalWithdrawal,
          lotteryWL: d.lotteryWL,
          thirdWL: d.thirdWL,
          totalWL: d.lotteryWL + d.thirdWL
        },
        tiers: {
          zero: tierMap.zero || 0,
          under1M: tierMap.under1M || 0,
          '1to5M': tierMap['1to5M'] || 0,
          '5to10M': tierMap['5to10M'] || 0,
          '10to50M': tierMap['10to50M'] || 0,
          over50M: tierMap.over50M || 0
        },
        winLossSeg: wlSeg,
        quality: {
          multiDeposit: d.multiDeposit,
          highValue: d.highValue,
          multiDepositRate:
            d.deposited > 0
              ? Math.round((d.multiDeposit / d.deposited) * 1000) / 10
              : 0
        }
      }
    });
  } catch (err) {
    log.error('dashboard/customer-analysis error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// ═══════════════════════════════════════
// ── GET /api/dashboard/win-loss-stats ──
// ═══════════════════════════════════════

router.get('/win-loss-stats', (req, res) => {
  const { startStr, endStr } = parseDateRange(req.query);
  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const ph = agentIds.map(() => '?').join(',');

    const agents = db
      .prepare(
        `SELECT id, label, ee88_username FROM ee88_agents
       WHERE id IN (${ph}) AND is_deleted = 0 ORDER BY id`
      )
      .all(...agentIds);
    const agentMap = {};
    agents.forEach((a) => {
      agentMap[a.id] = a;
    });

    // Gộp lottery + third per uid (LEFT JOIN + UNION ALL thay FULL OUTER JOIN vì SQLite)
    const customerRows = db
      .prepare(
        `SELECT agent_id, uid, username, lottery_wl, third_wl,
              COALESCE(lottery_wl, 0) + COALESCE(third_wl, 0) as total_wl
       FROM (
         SELECT COALESCE(l.agent_id, t.agent_id) as agent_id,
                COALESCE(l.uid, t.uid) as uid,
                COALESCE(l.username, t.username) as username,
                l.lottery_wl, t.third_wl
         FROM (
           SELECT agent_id, uid, username, SUM(win_lose) as lottery_wl
           FROM data_report_lottery WHERE agent_id IN (${ph})
           AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
           GROUP BY agent_id, uid
         ) l
         LEFT JOIN (
           SELECT agent_id, uid, username, SUM(t_win_lose) as third_wl
           FROM data_report_third WHERE agent_id IN (${ph})
           AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
           GROUP BY agent_id, uid
         ) t ON l.agent_id = t.agent_id AND l.uid = t.uid
         UNION ALL
         SELECT t2.agent_id, t2.uid, t2.username, NULL as lottery_wl, t2.third_wl
         FROM (
           SELECT agent_id, uid, username, SUM(t_win_lose) as third_wl
           FROM data_report_third WHERE agent_id IN (${ph})
           AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
           GROUP BY agent_id, uid
         ) t2
         LEFT JOIN (
           SELECT agent_id, uid FROM data_report_lottery WHERE agent_id IN (${ph})
           AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
           GROUP BY agent_id, uid
         ) l2 ON t2.agent_id = l2.agent_id AND t2.uid = l2.uid
         WHERE l2.uid IS NULL
       ) ORDER BY total_wl DESC`
      )
      .all(
        ...agentIds,
        startStr,
        endStr,
        ...agentIds,
        startStr,
        endStr,
        ...agentIds,
        startStr,
        endStr,
        ...agentIds,
        startStr,
        endStr
      );

    // Summary
    let winners = 0,
      losers = 0,
      draw = 0,
      totalWon = 0,
      totalLost = 0;
    customerRows.forEach((r) => {
      if (r.total_wl > 0) {
        winners++;
        totalWon += r.total_wl;
      } else if (r.total_wl < 0) {
        losers++;
        totalLost += r.total_wl;
      } else {
        draw++;
      }
    });

    // Top 50 winners (khách thắng = CT lỗ)
    const topWinners = customerRows
      .filter((r) => r.total_wl > 0)
      .slice(0, 50)
      .map((r) => ({
        username: r.username,
        uid: r.uid,
        agentLabel: (agentMap[r.agent_id] || {}).label || '',
        lotteryWL: r.lottery_wl || 0,
        thirdWL: r.third_wl || 0,
        totalWL: r.total_wl
      }));

    // Top 50 losers (khách thua = CT lời)
    const topLosers = customerRows
      .filter((r) => r.total_wl < 0)
      .sort((a, b) => a.total_wl - b.total_wl)
      .slice(0, 50)
      .map((r) => ({
        username: r.username,
        uid: r.uid,
        agentLabel: (agentMap[r.agent_id] || {}).label || '',
        lotteryWL: r.lottery_wl || 0,
        thirdWL: r.third_wl || 0,
        totalWL: r.total_wl
      }));

    // By agent
    const byAgentMap = {};
    customerRows.forEach((r) => {
      if (!byAgentMap[r.agent_id]) {
        const a = agentMap[r.agent_id] || {};
        byAgentMap[r.agent_id] = {
          agentId: r.agent_id,
          label: a.label || '',
          ee88Username: a.ee88_username || '',
          customers: 0,
          winners: 0,
          losers: 0,
          totalWon: 0,
          totalLost: 0
        };
      }
      const ag = byAgentMap[r.agent_id];
      ag.customers++;
      if (r.total_wl > 0) {
        ag.winners++;
        ag.totalWon += r.total_wl;
      } else if (r.total_wl < 0) {
        ag.losers++;
        ag.totalLost += r.total_wl;
      }
    });
    const byAgent = Object.values(byAgentMap).map((ag) => ({
      ...ag,
      companyProfit: -(ag.totalWon + ag.totalLost)
    }));

    res.json({
      code: 0,
      data: {
        startDate: startStr,
        endDate: endStr,
        summary: {
          totalCustomers: customerRows.length,
          winners,
          losers,
          draw,
          totalWon,
          totalLost,
          netProfit: -(totalWon + totalLost)
        },
        topWinners,
        topLosers,
        byAgent
      }
    });
  } catch (err) {
    log.error('dashboard/win-loss-stats error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// ═══════════════════════════════════════
// ── GET /api/dashboard/customer-status ──
// ═══════════════════════════════════════

router.get('/customer-status', (req, res) => {
  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const ph = agentIds.map(() => '?').join(',');

    const agents = db
      .prepare(
        `SELECT id, label FROM ee88_agents WHERE id IN (${ph}) AND is_deleted = 0`
      )
      .all(...agentIds);
    const agentMap = {};
    agents.forEach((a) => {
      agentMap[a.id] = a.label;
    });

    // JOIN members với tổng win_lose từ lottery + third (toàn bộ, không giới hạn ngày)
    const rows = db
      .prepare(
        `SELECT m.agent_id, m.uid, m.username, m.balance,
              COALESCE(m.deposit_money, 0) as deposit_money,
              COALESCE(m.withdrawal_money, 0) as withdrawal_money,
              COALESCE(l.wl, 0) as lottery_wl,
              COALESCE(t.wl, 0) as third_wl
       FROM data_members m
       LEFT JOIN (
         SELECT agent_id, uid, SUM(win_lose) as wl FROM data_report_lottery
         WHERE agent_id IN (${ph}) GROUP BY agent_id, uid
       ) l ON l.agent_id = m.agent_id AND l.uid = m.uid
       LEFT JOIN (
         SELECT agent_id, uid, SUM(t_win_lose) as wl FROM data_report_third
         WHERE agent_id IN (${ph}) GROUP BY agent_id, uid
       ) t ON t.agent_id = m.agent_id AND t.uid = m.uid
       WHERE m.agent_id IN (${ph})`
      )
      .all(...agentIds, ...agentIds, ...agentIds);

    // Phân loại
    const counts = { vip: 0, potential: 0, needCare: 0, normal: 0, new: 0 };
    const customers = rows.map((r) => {
      const totalWL = r.lottery_wl + r.third_wl;
      const actualProfit = r.withdrawal_money - r.deposit_money + r.balance;
      let category;
      if (r.deposit_money >= 100000000) {
        category = 'vip';
      } else if (r.deposit_money >= 10000000 && r.balance > 0) {
        category = 'potential';
      } else if (
        r.deposit_money > 0 &&
        (totalWL < -(r.deposit_money * 0.5) ||
          r.balance < r.deposit_money * 0.1)
      ) {
        category = 'needCare';
      } else if (r.deposit_money > 0) {
        category = 'normal';
      } else {
        category = 'new';
      }
      counts[category]++;
      return {
        uid: r.uid,
        username: r.username,
        agentLabel: agentMap[r.agent_id] || '',
        balance: r.balance,
        depositMoney: r.deposit_money,
        withdrawalMoney: r.withdrawal_money,
        lotteryWL: r.lottery_wl,
        thirdWL: r.third_wl,
        totalWL,
        actualProfit,
        category
      };
    });

    res.json({
      code: 0,
      data: { counts, customers, total: rows.length }
    });
  } catch (err) {
    log.error('dashboard/customer-status error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// ═══════════════════════════════════════
// ── GET /api/dashboard/qc-group-quality ──
// ═══════════════════════════════════════

router.get('/qc-group-quality', (req, res) => {
  const { startStr, endStr } = parseDateRange(req.query);
  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const ph = agentIds.map(() => '?').join(',');

    // Per group_id metrics
    const groups = db
      .prepare(
        `SELECT COALESCE(m.group_id, 0) as group_id,
                COUNT(*) as members,
                COALESCE(SUM(m.deposit_money), 0) as totalDeposit
         FROM data_members m WHERE m.agent_id IN (${ph})
         GROUP BY COALESCE(m.group_id, 0)`
      )
      .all(...agentIds);

    // Active per group
    const activeRows = db
      .prepare(
        `SELECT group_id, COUNT(*) as active FROM (
           SELECT DISTINCT m.group_id, a.uid FROM (
             SELECT uid FROM data_report_lottery
             WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
             UNION
             SELECT uid FROM data_report_third
             WHERE agent_id IN (${ph}) AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
           ) a JOIN data_members m ON a.uid = m.uid AND m.agent_id IN (${ph})
         ) GROUP BY group_id`
      )
      .all(
        ...agentIds,
        startStr,
        endStr,
        ...agentIds,
        startStr,
        endStr,
        ...agentIds
      );
    const activeMap = {};
    activeRows.forEach((r) => {
      activeMap[r.group_id] = r.active;
    });

    // Lottery stats per group
    const lotteryRows = db
      .prepare(
        `SELECT COALESCE(m.group_id, 0) as group_id,
                COALESCE(SUM(l.bet_amount), 0) as lotteryBet,
                COALESCE(SUM(l.win_lose), 0) as lotteryWL
         FROM data_report_lottery l
         JOIN data_members m ON l.uid = m.uid AND l.agent_id = m.agent_id
         WHERE l.agent_id IN (${ph})
         AND SUBSTR(l.date_key, 1, 10) >= ? AND SUBSTR(l.date_key, 1, 10) <= ?
         GROUP BY COALESCE(m.group_id, 0)`
      )
      .all(...agentIds, startStr, endStr);
    const lotteryMap = {};
    lotteryRows.forEach((r) => {
      lotteryMap[r.group_id] = r;
    });

    // Third stats per group
    const thirdRows = db
      .prepare(
        `SELECT COALESCE(m.group_id, 0) as group_id,
                COALESCE(SUM(t.t_bet_amount), 0) as thirdBet,
                COALESCE(SUM(t.t_win_lose), 0) as thirdWL
         FROM data_report_third t
         JOIN data_members m ON t.uid = m.uid AND t.agent_id = m.agent_id
         WHERE t.agent_id IN (${ph})
         AND SUBSTR(t.date_key, 1, 10) >= ? AND SUBSTR(t.date_key, 1, 10) <= ?
         GROUP BY COALESCE(m.group_id, 0)`
      )
      .all(...agentIds, startStr, endStr);
    const thirdMap = {};
    thirdRows.forEach((r) => {
      thirdMap[r.group_id] = r;
    });

    let totalMembers = 0,
      totalActive = 0,
      totalDep = 0;
    const result = groups.map((g) => {
      const gid = g.group_id;
      const active = activeMap[gid] || 0;
      const lot = lotteryMap[gid] || { lotteryBet: 0, lotteryWL: 0 };
      const thd = thirdMap[gid] || { thirdBet: 0, thirdWL: 0 };
      totalMembers += g.members;
      totalActive += active;
      totalDep += g.totalDeposit;
      return {
        groupId: gid,
        members: g.members,
        active,
        totalDeposit: g.totalDeposit,
        lotteryBet: lot.lotteryBet,
        lotteryWL: lot.lotteryWL,
        thirdBet: thd.thirdBet,
        thirdWL: thd.thirdWL
      };
    });

    res.json({
      code: 0,
      data: {
        startDate: startStr,
        endDate: endStr,
        summary: {
          totalGroups: groups.length,
          totalMembers,
          totalActive,
          totalDeposit: totalDep
        },
        groups: result
      }
    });
  } catch (err) {
    log.error('dashboard/qc-group-quality error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// ═══════════════════════════════════════
// ── GET /api/dashboard/provider-analysis ──
// ═══════════════════════════════════════

router.get('/provider-analysis', (req, res) => {
  const { startStr, endStr } = parseDateRange(req.query);
  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const ph = agentIds.map(() => '?').join(',');

    // Per platform from report_third
    const platforms = db
      .prepare(
        `SELECT platform_id, platform_id_name,
                COUNT(DISTINCT uid) as players,
                COALESCE(SUM(t_bet_amount), 0) as betAmount,
                COALESCE(SUM(t_bet_times), 0) as betTimes,
                COALESCE(SUM(t_win_lose), 0) as winLose
         FROM data_report_third WHERE agent_id IN (${ph})
         AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
         GROUP BY platform_id ORDER BY betAmount DESC`
      )
      .all(...agentIds, startStr, endStr);

    // Top 30 games from bet_orders
    const topGames = db
      .prepare(
        `SELECT game_name, platform_id_name,
                COUNT(DISTINCT uid) as players,
                COUNT(*) as betCount,
                COALESCE(SUM(bet_amount), 0) as betAmount,
                COALESCE(SUM(win_lose), 0) as winLose
         FROM data_bet_orders WHERE agent_id IN (${ph})
         AND bet_time >= ? AND bet_time < ? || ' 23:59:59'
         GROUP BY game_name ORDER BY betAmount DESC LIMIT 30`
      )
      .all(...agentIds, startStr, endStr);

    let totalBet = 0,
      totalWL = 0;
    platforms.forEach((p) => {
      totalBet += p.betAmount;
      totalWL += p.winLose;
    });

    res.json({
      code: 0,
      data: {
        startDate: startStr,
        endDate: endStr,
        summary: {
          totalProviders: platforms.length,
          totalBet,
          totalWL
        },
        platforms: platforms.map((p) => ({
          ...p,
          companyProfit: -p.winLose
        })),
        topGames: topGames.map((g) => ({
          ...g,
          companyProfit: -g.winLose
        }))
      }
    });
  } catch (err) {
    log.error('dashboard/provider-analysis error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// ═══════════════════════════════════════
// ── GET /api/dashboard/lottery-analysis ──
// ═══════════════════════════════════════

router.get('/lottery-analysis', (req, res) => {
  const { startStr, endStr } = parseDateRange(req.query);
  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const ph = agentIds.map(() => '?').join(',');

    const lotteries = db
      .prepare(
        `SELECT lottery_name,
                COUNT(DISTINCT uid) as players,
                COALESCE(SUM(bet_count), 0) as betCount,
                COALESCE(SUM(bet_amount), 0) as betAmount,
                COALESCE(SUM(valid_amount), 0) as validAmount,
                COALESCE(SUM(prize), 0) as prize,
                COALESCE(SUM(rebate_amount), 0) as rebateAmount,
                COALESCE(SUM(result), 0) as result,
                COALESCE(SUM(win_lose), 0) as winLose
         FROM data_report_lottery WHERE agent_id IN (${ph})
         AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
         GROUP BY lottery_name ORDER BY betAmount DESC`
      )
      .all(...agentIds, startStr, endStr);

    let totalBet = 0,
      totalWL = 0;
    lotteries.forEach((l) => {
      totalBet += l.betAmount;
      totalWL += l.winLose;
    });

    res.json({
      code: 0,
      data: {
        startDate: startStr,
        endDate: endStr,
        summary: {
          totalLotteries: lotteries.length,
          totalBet,
          totalWL
        },
        lotteries: lotteries.map((l) => ({
          ...l,
          companyProfit: -l.winLose
        }))
      }
    });
  } catch (err) {
    log.error('dashboard/lottery-analysis error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// ═══════════════════════════════════════
// ── GET /api/dashboard/deposit-withdraw-analysis ──
// ═══════════════════════════════════════

router.get('/deposit-withdraw-analysis', (req, res) => {
  const { startStr, endStr } = parseDateRange(req.query);
  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const ph = agentIds.map(() => '?').join(',');

    // Daily totals
    const daily = db
      .prepare(
        `SELECT SUBSTR(date_key, 1, 10) as day,
                COALESCE(SUM(deposit_amount), 0) as deposit,
                COALESCE(SUM(withdrawal_amount), 0) as withdrawal,
                COALESCE(SUM(promotion), 0) as promotion,
                COALESCE(SUM(third_rebate), 0) as thirdRebate
         FROM data_report_funds WHERE agent_id IN (${ph})
         AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
         GROUP BY SUBSTR(date_key, 1, 10) ORDER BY day`
      )
      .all(...agentIds, startStr, endStr);

    // Per agent
    const agents = db
      .prepare(
        `SELECT id, label, ee88_username FROM ee88_agents
         WHERE id IN (${ph}) AND is_deleted = 0 ORDER BY id`
      )
      .all(...agentIds);

    const perAgent = db
      .prepare(
        `SELECT agent_id,
                COALESCE(SUM(deposit_amount), 0) as deposit,
                COALESCE(SUM(withdrawal_amount), 0) as withdrawal,
                COALESCE(SUM(promotion), 0) as promotion,
                COALESCE(SUM(third_rebate), 0) as thirdRebate
         FROM data_report_funds WHERE agent_id IN (${ph})
         AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
         GROUP BY agent_id`
      )
      .all(...agentIds, startStr, endStr);
    const agentDataMap = {};
    perAgent.forEach((r) => {
      agentDataMap[r.agent_id] = r;
    });

    let totalDep = 0,
      totalWd = 0,
      totalPro = 0,
      totalReb = 0;
    daily.forEach((d) => {
      totalDep += d.deposit;
      totalWd += d.withdrawal;
      totalPro += d.promotion;
      totalReb += d.thirdRebate;
    });

    res.json({
      code: 0,
      data: {
        startDate: startStr,
        endDate: endStr,
        summary: {
          totalDeposit: totalDep,
          totalWithdrawal: totalWd,
          net: totalDep - totalWd,
          totalPromotion: totalPro,
          totalRebate: totalReb
        },
        daily,
        perAgent: agents.map((a) => {
          const d = agentDataMap[a.id] || {
            deposit: 0,
            withdrawal: 0,
            promotion: 0,
            thirdRebate: 0
          };
          return {
            agentId: a.id,
            label: a.label,
            ee88Username: a.ee88_username,
            deposit: d.deposit,
            withdrawal: d.withdrawal,
            net: d.deposit - d.withdrawal,
            promotion: d.promotion,
            thirdRebate: d.thirdRebate
          };
        })
      }
    });
  } catch (err) {
    log.error('dashboard/deposit-withdraw-analysis error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// ═══════════════════════════════════════
// ── GET /api/dashboard/customer-retention ──
// ═══════════════════════════════════════

router.get('/customer-retention', (req, res) => {
  const { startStr, endStr } = parseDateRange(req.query);
  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const ph = agentIds.map(() => '?').join(',');

    // Kỳ trước cùng độ dài
    const days =
      Math.round((new Date(endStr) - new Date(startStr)) / 86400000) + 1;
    const prevEnd = new Date(startStr);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - days + 1);
    const prevStartStr = fmtDate(prevStart);
    const prevEndStr = fmtDate(prevEnd);

    // Active UIDs kỳ hiện tại
    const currentActive = db
      .prepare(
        `SELECT DISTINCT uid FROM (
           SELECT uid FROM data_report_lottery WHERE agent_id IN (${ph})
           AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
           UNION
           SELECT uid FROM data_report_third WHERE agent_id IN (${ph})
           AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
         )`
      )
      .all(...agentIds, startStr, endStr, ...agentIds, startStr, endStr);
    const currentUids = new Set(currentActive.map((r) => r.uid));

    // Active UIDs kỳ trước
    const prevActive = db
      .prepare(
        `SELECT DISTINCT uid FROM (
           SELECT uid FROM data_report_lottery WHERE agent_id IN (${ph})
           AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
           UNION
           SELECT uid FROM data_report_third WHERE agent_id IN (${ph})
           AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
         )`
      )
      .all(
        ...agentIds,
        prevStartStr,
        prevEndStr,
        ...agentIds,
        prevStartStr,
        prevEndStr
      );
    const prevUids = new Set(prevActive.map((r) => r.uid));

    // Khách mới đăng ký trong khoảng
    const newMembers = db
      .prepare(
        `SELECT COUNT(*) as cnt FROM data_members
         WHERE agent_id IN (${ph}) AND register_time >= ? AND register_time < ? || ' 23:59:59'`
      )
      .get(...agentIds, startStr, endStr).cnt;

    // Quay lại = active kỳ hiện tại AND active kỳ trước
    let returning = 0;
    currentUids.forEach((uid) => {
      if (prevUids.has(uid)) returning++;
    });

    // Rời bỏ = active kỳ trước BUT NOT kỳ hiện tại
    let churned = 0;
    prevUids.forEach((uid) => {
      if (!currentUids.has(uid)) churned++;
    });

    // Mới = active kỳ hiện tại BUT NOT kỳ trước
    let newActive = 0;
    currentUids.forEach((uid) => {
      if (!prevUids.has(uid)) newActive++;
    });

    const retentionRate =
      prevUids.size > 0
        ? Math.round((returning / prevUids.size) * 1000) / 10
        : 0;

    // Per agent breakdown
    const memberAgentMap = {};
    const membersAll = db
      .prepare(
        `SELECT uid, agent_id FROM data_members WHERE agent_id IN (${ph})`
      )
      .all(...agentIds);
    membersAll.forEach((m) => {
      memberAgentMap[m.uid] = m.agent_id;
    });

    const agentsInfo = db
      .prepare(
        `SELECT id, label, ee88_username FROM ee88_agents
         WHERE id IN (${ph}) AND is_deleted = 0`
      )
      .all(...agentIds);
    const byAgent = {};
    agentsInfo.forEach((a) => {
      byAgent[a.id] = {
        agentId: a.id,
        label: a.label,
        ee88Username: a.ee88_username,
        active: 0,
        newActive: 0,
        returning: 0,
        churned: 0
      };
    });

    currentUids.forEach((uid) => {
      const aid = memberAgentMap[uid];
      if (aid && byAgent[aid]) {
        byAgent[aid].active++;
        if (prevUids.has(uid)) byAgent[aid].returning++;
        else byAgent[aid].newActive++;
      }
    });
    prevUids.forEach((uid) => {
      const aid = memberAgentMap[uid];
      if (aid && byAgent[aid] && !currentUids.has(uid)) {
        byAgent[aid].churned++;
      }
    });

    const byAgentArr = Object.values(byAgent).map((a) => ({
      ...a,
      retentionRate:
        a.returning + a.churned > 0
          ? Math.round((a.returning / (a.returning + a.churned)) * 1000) / 10
          : 0
    }));

    res.json({
      code: 0,
      data: {
        startDate: startStr,
        endDate: endStr,
        summary: {
          totalActive: currentUids.size,
          newMembers,
          newActive,
          returning,
          churned,
          retentionRate
        },
        byAgent: byAgentArr
      }
    });
  } catch (err) {
    log.error('dashboard/customer-retention error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// ═══════════════════════════════════════
// ── GET /api/dashboard/promotion-analysis ──
// ═══════════════════════════════════════

router.get('/promotion-analysis', (req, res) => {
  const { startStr, endStr } = parseDateRange(req.query);
  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const ph = agentIds.map(() => '?').join(',');

    const agents = db
      .prepare(
        `SELECT id, label, ee88_username FROM ee88_agents
         WHERE id IN (${ph}) AND is_deleted = 0 ORDER BY id`
      )
      .all(...agentIds);

    const perAgent = db
      .prepare(
        `SELECT agent_id,
                COALESCE(SUM(promotion), 0) as promotion,
                COALESCE(SUM(third_rebate), 0) as thirdRebate,
                COALESCE(SUM(third_activity_amount), 0) as thirdActivity,
                COALESCE(SUM(deposit_amount), 0) as totalDeposit
         FROM data_report_funds WHERE agent_id IN (${ph})
         AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
         GROUP BY agent_id`
      )
      .all(...agentIds, startStr, endStr);
    const dataMap = {};
    perAgent.forEach((r) => {
      dataMap[r.agent_id] = r;
    });

    let totalPro = 0,
      totalReb = 0,
      totalAct = 0,
      totalDep = 0;
    perAgent.forEach((r) => {
      totalPro += r.promotion;
      totalReb += r.thirdRebate;
      totalAct += r.thirdActivity;
      totalDep += r.totalDeposit;
    });

    const promoRate =
      totalDep > 0 ? Math.round((totalPro / totalDep) * 1000) / 10 : 0;

    res.json({
      code: 0,
      data: {
        startDate: startStr,
        endDate: endStr,
        summary: {
          totalPromotion: totalPro,
          totalRebate: totalReb,
          totalActivity: totalAct,
          totalDeposit: totalDep,
          promoRate
        },
        perAgent: agents.map((a) => {
          const d = dataMap[a.id] || {
            promotion: 0,
            thirdRebate: 0,
            thirdActivity: 0,
            totalDeposit: 0
          };
          return {
            agentId: a.id,
            label: a.label,
            ee88Username: a.ee88_username,
            promotion: d.promotion,
            thirdRebate: d.thirdRebate,
            thirdActivity: d.thirdActivity,
            totalDeposit: d.totalDeposit,
            promoRate:
              d.totalDeposit > 0
                ? Math.round((d.promotion / d.totalDeposit) * 1000) / 10
                : 0
          };
        })
      }
    });
  } catch (err) {
    log.error('dashboard/promotion-analysis error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// ═══════════════════════════════════════
// ── GET /api/dashboard/financial-summary ──
// ═══════════════════════════════════════

router.get('/financial-summary', (req, res) => {
  const { startStr, endStr } = parseDateRange(req.query);
  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const ph = agentIds.map(() => '?').join(',');

    // Kỳ trước
    const numDays =
      Math.round((new Date(endStr) - new Date(startStr)) / 86400000) + 1;
    const prevEnd = new Date(startStr);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd);
    prevStart.setDate(prevStart.getDate() - numDays + 1);
    const prevStartStr = fmtDate(prevStart);
    const prevEndStr = fmtDate(prevEnd);

    const agents = db
      .prepare(
        `SELECT id, label, ee88_username FROM ee88_agents
         WHERE id IN (${ph}) AND is_deleted = 0 ORDER BY id`
      )
      .all(...agentIds);

    function queryPeriod(s, e) {
      const lotteryWL = db
        .prepare(
          `SELECT agent_id, COALESCE(SUM(win_lose), 0) as wl
           FROM data_report_lottery WHERE agent_id IN (${ph})
           AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
           GROUP BY agent_id`
        )
        .all(...agentIds, s, e);

      const thirdWL = db
        .prepare(
          `SELECT agent_id, COALESCE(SUM(t_win_lose), 0) as wl
           FROM data_report_third WHERE agent_id IN (${ph})
           AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
           GROUP BY agent_id`
        )
        .all(...agentIds, s, e);

      const funds = db
        .prepare(
          `SELECT agent_id,
                  COALESCE(SUM(promotion), 0) as promotion,
                  COALESCE(SUM(third_rebate), 0) as thirdRebate,
                  COALESCE(SUM(deposit_amount), 0) as deposit,
                  COALESCE(SUM(withdrawal_amount), 0) as withdrawal
           FROM data_report_funds WHERE agent_id IN (${ph})
           AND SUBSTR(date_key, 1, 10) >= ? AND SUBSTR(date_key, 1, 10) <= ?
           GROUP BY agent_id`
        )
        .all(...agentIds, s, e);

      return { lotteryWL, thirdWL, funds };
    }

    function buildResult(q) {
      const lotMap = {},
        thdMap = {},
        fundsMap = {};
      q.lotteryWL.forEach((r) => {
        lotMap[r.agent_id] = r.wl;
      });
      q.thirdWL.forEach((r) => {
        thdMap[r.agent_id] = r.wl;
      });
      q.funds.forEach((r) => {
        fundsMap[r.agent_id] = {
          promotion: r.promotion,
          thirdRebate: r.thirdRebate,
          deposit: r.deposit,
          withdrawal: r.withdrawal
        };
      });

      let totRevenue = 0,
        totCost = 0;
      const perAgent = agents.map((a) => {
        const lw = lotMap[a.id] || 0;
        const tw = thdMap[a.id] || 0;
        const f = fundsMap[a.id] || {
          promotion: 0,
          thirdRebate: 0,
          deposit: 0,
          withdrawal: 0
        };
        const cost = f.promotion + f.thirdRebate;
        const revenue = -(lw + tw + f.promotion + f.thirdRebate);
        const profit = revenue;
        totRevenue += revenue;
        totCost += cost;
        return {
          agentId: a.id,
          label: a.label,
          ee88Username: a.ee88_username,
          lotteryWL: lw,
          thirdWL: tw,
          promotion: f.promotion,
          thirdRebate: f.thirdRebate,
          revenue,
          cost,
          profit,
          margin:
            revenue !== 0
              ? Math.round((profit / Math.abs(revenue)) * 1000) / 10
              : 0
        };
      });
      return {
        perAgent,
        totals: {
          revenue: totRevenue,
          cost: totCost,
          profit: totRevenue,
          margin:
            totRevenue !== 0
              ? Math.round((totRevenue / Math.abs(totRevenue)) * 1000) / 10
              : 0
        }
      };
    }

    const cur = buildResult(queryPeriod(startStr, endStr));
    const prev = buildResult(queryPeriod(prevStartStr, prevEndStr));

    let comparison = 'SAME';
    if (prev.totals.profit === 0 && cur.totals.profit !== 0) comparison = 'NEW';
    else if (cur.totals.profit > prev.totals.profit) comparison = 'UP';
    else if (cur.totals.profit < prev.totals.profit) comparison = 'DOWN';

    const changePct =
      prev.totals.profit !== 0
        ? Math.round(
            ((cur.totals.profit - prev.totals.profit) /
              Math.abs(prev.totals.profit)) *
              1000
          ) / 10
        : 0;

    res.json({
      code: 0,
      data: {
        startDate: startStr,
        endDate: endStr,
        perAgent: cur.perAgent,
        totals: cur.totals,
        prevTotals: prev.totals,
        comparison,
        changePct
      }
    });
  } catch (err) {
    log.error('dashboard/financial-summary error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// ═══════════════════════════════════════
// ── GET /api/dashboard/detailed-game-stats ──
// ═══════════════════════════════════════

router.get('/detailed-game-stats', (req, res) => {
  const { startStr, endStr } = parseDateRange(req.query);
  try {
    const db = getDb();
    const agentIds = req.agentIds;
    const ph = agentIds.map(() => '?').join(',');

    const games = db
      .prepare(
        `SELECT game_name, platform_id_name,
                COUNT(DISTINCT uid) as players,
                COUNT(*) as betCount,
                COALESCE(SUM(bet_amount), 0) as betAmount,
                COALESCE(SUM(turnover), 0) as turnover,
                COALESCE(SUM(prize), 0) as prize,
                COALESCE(SUM(win_lose), 0) as winLose
         FROM data_bet_orders WHERE agent_id IN (${ph})
         AND bet_time >= ? AND bet_time < ? || ' 23:59:59'
         GROUP BY game_name, platform_id_name ORDER BY betAmount DESC`
      )
      .all(...agentIds, startStr, endStr);

    let totalBet = 0,
      totalWL = 0,
      totalBetCount = 0;
    games.forEach((g) => {
      totalBet += g.betAmount;
      totalWL += g.winLose;
      totalBetCount += g.betCount;
    });

    res.json({
      code: 0,
      data: {
        startDate: startStr,
        endDate: endStr,
        summary: {
          totalGames: games.length,
          totalBetCount,
          totalBet,
          totalWL,
          companyProfit: -totalWL
        },
        games: games.map((g) => ({
          ...g,
          companyProfit: -g.winLose
        }))
      }
    });
  } catch (err) {
    log.error('dashboard/detailed-game-stats error: ' + err.message);
    res.json({ code: -1, msg: err.message });
  }
});

// ═══════════════════════════════════════

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
