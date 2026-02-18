/**
 * Phase 7: Data Store — lưu data thực sự vào SQLite
 * Mỗi endpoint có bảng riêng với cột rõ ràng, queryable.
 * Các field không có cột riêng được lưu vào `extra` JSON.
 */
const { getDb } = require('../database/init');
const { createLogger } = require('../utils/logger');

const log = createLogger('dataStore');

// ═══════════════════════════════════════
// ── Column definitions per endpoint ──
// ═══════════════════════════════════════

const COLUMN_MAP = {
  members: {
    table: 'data_members',
    columns: ['uid', 'username', 'user_parent', 'user_parent_format', 'user_tree', 'group_id', 'balance', 'status', 'is_tester', 'register_time', 'last_login_time'],
    // EE88 field → DB column mapping (khi tên khác nhau)
    fieldMap: { id: 'uid', money: 'balance', login_time: 'last_login_time', parent_user: 'user_parent_format' },
    uniqueKey: ['agent_id', 'uid']
  },
  invites: {
    table: 'data_invites',
    columns: ['uid', 'invite_code', 'user_type', 'group_id', 'reg_count', 'scope_reg_count', 'recharge_count', 'first_recharge_count', 'register_recharge_count', 'remark', 'rebate_arr', 'create_time', 'update_time'],
    fieldMap: { id: 'ee88_id' },
    idField: 'ee88_id',
    uniqueKey: ['agent_id', 'ee88_id']
  },
  deposits: {
    table: 'data_deposits',
    columns: ['serial_no', 'uid', 'username', 'user_parent', 'user_parent_format', 'user_tree', 'group_id', 'type', 'amount', 'true_amount', 'status', 'operator', 'name', 'bank_id', 'account', 'branch', 'category_id', 'merchant_id', 'pay_type', 'trade_id', 'firm_fee', 'user_fee', 'rebate', 'prize_amount', 'activity_id', 'currency', 'remark', 'user_remark', 'is_tester', 'create_time', 'success_time', 'review_time', 'transfer_time'],
    uniqueKey: ['agent_id', 'serial_no'],
    hasDate: true
  },
  withdrawals: {
    table: 'data_withdrawals',
    columns: ['serial_no', 'uid', 'username', 'user_parent', 'user_parent_format', 'user_tree', 'group_id', 'amount', 'true_amount', 'name', 'bank_id', 'account', 'branch', 'status', 'status_format', 'operator', 'firm_fee', 'user_fee', 'rebate', 'category_id', 'merchant_id', 'pay_type', 'trade_id', 'currency', 'remark', 'user_remark', 'is_tester', 'create_time', 'success_time', 'review_time', 'transfer_time'],
    uniqueKey: ['agent_id', 'serial_no'],
    hasDate: true
  },
  'bet-orders': {
    table: 'data_bet_orders',
    columns: ['serial_no', 'uid', 'username', 'platform_id', 'platform_id_name', 'cid', 'c_name', 'game_name', 'bet_amount', 'turnover', 'prize', 'win_lose', 'bet_time', 'platform_username'],
    uniqueKey: ['agent_id', 'serial_no'],
    hasDate: true
  },
  'report-lottery': {
    table: 'data_report_lottery',
    columns: ['uid', 'username', 'user_parent_format', 'lottery_id', 'lottery_name', 'bet_count', 'bet_amount', 'valid_amount', 'rebate_amount', 'prize', 'result', 'win_lose'],
    uniqueKey: ['agent_id', 'date_key', 'uid', 'lottery_id'],
    hasDate: true,
    needsDateKey: true
  },
  'report-funds': {
    table: 'data_report_funds',
    columns: ['uid', 'username', 'user_parent', 'user_parent_format', 'date', 'deposit_count', 'deposit_amount', 'withdrawal_count', 'withdrawal_amount', 'charge_fee', 'agent_commission', 'promotion', 'third_rebate', 'third_activity_amount'],
    uniqueKey: ['agent_id', 'date_key', 'uid'],
    hasDate: true,
    needsDateKey: true
  },
  'report-third': {
    table: 'data_report_third',
    columns: ['uid', 'username', 'platform_id', 'platform_id_name', 't_bet_amount', 't_bet_times', 't_turnover', 't_prize', 't_win_lose'],
    uniqueKey: ['agent_id', 'date_key', 'uid', 'platform_id'],
    hasDate: true,
    needsDateKey: true
  },
  'lottery-bets': {
    table: 'data_lottery_bets',
    columns: ['serial_no', 'uid', 'username', 'lottery_name', 'play_type_name', 'play_name', 'issue', 'content', 'money', 'rebate_amount', 'result', 'status_text', 'create_time'],
    uniqueKey: ['agent_id', 'serial_no'],
    hasDate: true
  }
};

// ═══════════════════════════════════════
// ── Prepared statement cache ──
// ═══════════════════════════════════════

const stmtCache = {};

function getInsertStmt(endpointKey) {
  if (stmtCache[endpointKey]) return stmtCache[endpointKey];

  const mapping = COLUMN_MAP[endpointKey];
  if (!mapping) return null;

  const db = getDb();
  const allCols = ['agent_id', ...mapping.columns, 'extra', 'synced_at'];
  if (mapping.needsDateKey) allCols.splice(1, 0, 'date_key');
  if (mapping.idField) {
    // invites: rename id → ee88_id
    const idx = allCols.indexOf('ee88_id');
    if (idx === -1) allCols.splice(1, 0, mapping.idField);
  }

  const placeholders = allCols.map(() => '?').join(', ');
  const sql = `INSERT OR REPLACE INTO ${mapping.table} (${allCols.join(', ')}) VALUES (${placeholders})`;

  stmtCache[endpointKey] = db.prepare(sql);
  return stmtCache[endpointKey];
}

// ═══════════════════════════════════════
// ── Core save function ──
// ═══════════════════════════════════════

/**
 * Lưu data rows vào bảng tương ứng
 * @param {number} agentId
 * @param {string} endpointKey
 * @param {Array} rows — mảng data rows từ EE88
 * @param {object|null} totalData — total_data object
 * @param {string|null} dateKey — "YYYY-MM-DD|YYYY-MM-DD" cho report endpoints
 */
function saveData(agentId, endpointKey, rows, totalData, dateKey) {
  if (!Array.isArray(rows) || rows.length === 0) return 0;

  const mapping = COLUMN_MAP[endpointKey];
  if (!mapping) return 0;

  const db = getDb();
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  let saved = 0;

  try {
    const insertMany = db.transaction((dataRows) => {
      for (const row of dataRows) {
        try {
          const values = buildValues(mapping, agentId, row, dateKey, now);
          const stmt = getInsertStmt(endpointKey);
          if (stmt) {
            stmt.run(...values);
            saved++;
          }
        } catch (rowErr) {
          // Skip bad rows silently
        }
      }
    });

    insertMany(rows);

    // Lưu total_data nếu có
    if (totalData && dateKey) {
      saveTotals(agentId, endpointKey, dateKey, totalData);
    }

    log.info(`[${endpointKey}] Saved ${saved}/${rows.length} rows for agent=${agentId}` +
      (dateKey ? ` date=${dateKey}` : ''));
  } catch (err) {
    log.error(`[${endpointKey}] Save failed for agent=${agentId}: ${err.message}`);
  }

  return saved;
}

/**
 * Build values array cho INSERT statement
 * Hỗ trợ fieldMap: { responseField: 'dbColumn' }
 */
function buildValues(mapping, agentId, row, dateKey, now) {
  const values = [agentId];
  const fieldMap = mapping.fieldMap || {};

  // Tạo reverse map: dbColumn → responseField
  const reverseMap = {};
  for (const [srcField, dbCol] of Object.entries(fieldMap)) {
    reverseMap[dbCol] = srcField;
  }

  // Tập hợp tất cả response field đã sử dụng (để tính extra)
  const usedFields = new Set(['_agent_id', '_agent_label']);

  // date_key nếu cần
  if (mapping.needsDateKey) {
    values.push(dateKey || '');
  }

  // idField (invites: id → ee88_id)
  if (mapping.idField) {
    values.push(row.id != null ? row.id : null);
    usedFields.add('id');
  }

  // Các cột chính
  for (const col of mapping.columns) {
    // Tìm giá trị: ưu tiên reverse map, fallback dùng tên cột trực tiếp
    const srcField = reverseMap[col];
    let val;
    if (srcField && row[srcField] != null) {
      val = row[srcField];
      usedFields.add(srcField);
    } else {
      val = row[col];
      usedFields.add(col);
    }

    // Convert objects/arrays to JSON string
    if (val !== null && val !== undefined && typeof val === 'object') {
      val = JSON.stringify(val);
    }
    values.push(val != null ? val : null);
  }

  // Extra: các field không có cột riêng
  const extraObj = {};
  for (const key in row) {
    if (!usedFields.has(key)) {
      extraObj[key] = row[key];
    }
  }
  values.push(Object.keys(extraObj).length > 0 ? JSON.stringify(extraObj) : null);

  // synced_at
  values.push(now);

  return values;
}

/**
 * Lưu total_data vào bảng data_totals
 */
function saveTotals(agentId, endpointKey, dateKey, totalData) {
  if (!totalData) return;
  const db = getDb();
  try {
    db.prepare(`
      INSERT OR REPLACE INTO data_totals (agent_id, endpoint_key, date_key, total_json, synced_at)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(agentId, endpointKey, dateKey, JSON.stringify(totalData));
  } catch (err) {
    log.error(`Save totals failed: agent=${agentId} ep=${endpointKey}: ${err.message}`);
  }
}

// ═══════════════════════════════════════
// ── Query functions ──
// ═══════════════════════════════════════

/**
 * Query data từ bảng tương ứng
 * @param {string} endpointKey
 * @param {object} options — { agentId, dateKey, page, limit, search, orderBy, order }
 */
function queryData(endpointKey, options = {}) {
  const mapping = COLUMN_MAP[endpointKey];
  if (!mapping) return { data: [], count: 0 };

  const db = getDb();
  const { agentId, dateKey, page = 1, limit = 50, search, orderBy, order = 'DESC' } = options;

  let where = 'WHERE 1=1';
  const params = [];

  if (agentId) {
    where += ' AND agent_id = ?';
    params.push(agentId);
  }
  if (dateKey && mapping.needsDateKey) {
    where += ' AND date_key = ?';
    params.push(dateKey);
  }
  if (search) {
    where += ' AND username LIKE ?';
    params.push(`%${search}%`);
  }

  // Count
  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM ${mapping.table} ${where}`).get(...params);

  // Data
  const validOrder = order === 'ASC' ? 'ASC' : 'DESC';
  const orderCol = mapping.columns.includes(orderBy) ? orderBy : 'id';
  const offset = (page - 1) * limit;

  const rows = db.prepare(`
    SELECT * FROM ${mapping.table} ${where}
    ORDER BY ${orderCol} ${validOrder}
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return { data: rows, count: countRow.cnt };
}

/**
 * Query totals từ bảng data_totals
 */
function queryTotals(endpointKey, agentId, dateKey) {
  const db = getDb();
  const row = db.prepare(
    'SELECT total_json FROM data_totals WHERE agent_id = ? AND endpoint_key = ? AND date_key = ?'
  ).get(agentId, endpointKey, dateKey);

  if (!row) return null;
  try {
    return JSON.parse(row.total_json);
  } catch {
    return null;
  }
}

/**
 * Thống kê data đã lưu
 */
function getDataStats() {
  const db = getDb();
  const stats = {};

  for (const [key, mapping] of Object.entries(COLUMN_MAP)) {
    const row = db.prepare(`SELECT COUNT(*) as cnt FROM ${mapping.table}`).get();
    stats[key] = row.cnt;
  }

  const totals = db.prepare('SELECT COUNT(*) as cnt FROM data_totals').get();
  stats._totals = totals.cnt;

  return stats;
}

/**
 * Xoá data cũ (theo agent hoặc toàn bộ)
 */
function clearData(endpointKey, agentId) {
  const mapping = COLUMN_MAP[endpointKey];
  if (!mapping) return 0;

  const db = getDb();
  let sql = `DELETE FROM ${mapping.table}`;
  const params = [];

  if (agentId) {
    sql += ' WHERE agent_id = ?';
    params.push(agentId);
  }

  const result = db.prepare(sql).run(...params);
  log.info(`Cleared ${result.changes} rows from ${mapping.table}` + (agentId ? ` agent=${agentId}` : ''));
  return result.changes;
}

/**
 * Lấy danh sách endpoints có data
 */
function getEndpointList() {
  return Object.keys(COLUMN_MAP);
}

// ═══════════════════════════════════════
// ── Local-first display query ──
// ═══════════════════════════════════════

/**
 * Tìm cột date cho endpoint (dùng để filter date range)
 */
function getDateColumn(endpointKey) {
  switch (endpointKey) {
    case 'deposits':
    case 'withdrawals':
    case 'lottery-bets':
      return 'create_time';
    case 'bet-orders':
      return 'bet_time';
    default:
      return null;
  }
}

/**
 * Query data từ DB local cho hiển thị (tất cả agents, có filter date)
 * Dùng cho stale-while-revalidate: hiện data cũ ngay → refresh nền
 *
 * @param {number[]} agentIds — danh sách agent ID
 * @param {string} endpointKey
 * @param {string|null} startDate — YYYY-MM-DD
 * @param {string|null} endDate — YYYY-MM-DD
 * @returns {{ data: Array, count: number, totalData: object|null } | null}
 */
function queryForDisplay(agentIds, endpointKey, startDate, endDate) {
  const mapping = COLUMN_MAP[endpointKey];
  if (!mapping || !agentIds || agentIds.length === 0) return null;

  const db = getDb();
  const placeholders = agentIds.map(() => '?').join(',');
  let where = `WHERE agent_id IN (${placeholders})`;
  const params = [...agentIds];

  // Date filter cho report endpoints (date_key column)
  if (mapping.needsDateKey && startDate && endDate) {
    where += ' AND date_key = ?';
    params.push(startDate + '|' + endDate);
  }
  // Date filter cho transaction endpoints (create_time / bet_time column)
  else if (mapping.hasDate && startDate && endDate) {
    const dateCol = getDateColumn(endpointKey);
    if (dateCol) {
      where += ` AND ${dateCol} >= ? AND ${dateCol} <= ?`;
      params.push(startDate, endDate + ' 23:59:59');
    }
  }

  try {
    const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM ${mapping.table} ${where}`).get(...params);
    if (!countRow || countRow.cnt === 0) return null;

    const rows = db.prepare(`SELECT * FROM ${mapping.table} ${where} ORDER BY id DESC`).all(...params);

    // Aggregate total_data từ data_totals
    let totalData = null;
    if (startDate && endDate) {
      const dateKey = startDate + '|' + endDate;
      for (const agentId of agentIds) {
        const t = queryTotals(endpointKey, agentId, dateKey);
        if (t) {
          if (!totalData) { totalData = { ...t }; }
          else {
            for (const k in t) {
              const v = parseFloat(t[k]);
              if (!isNaN(v)) totalData[k] = (parseFloat(totalData[k]) || 0) + v;
            }
          }
        }
      }
    }

    return { data: rows, count: countRow.cnt, totalData };
  } catch (err) {
    log.error(`queryForDisplay [${endpointKey}] lỗi: ${err.message}`);
    return null;
  }
}

module.exports = {
  saveData,
  saveTotals,
  queryData,
  queryTotals,
  queryForDisplay,
  getDataStats,
  clearData,
  getEndpointList,
  COLUMN_MAP
};
