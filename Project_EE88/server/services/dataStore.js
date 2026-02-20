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
    columns: [
      'uid',
      'username',
      'user_parent',
      'user_parent_format',
      'user_tree',
      'group_id',
      'balance',
      'status',
      'is_tester',
      'register_time',
      'last_login_time',
      'first_deposit_time',
      'deposit_money',
      'withdrawal_money'
    ],
    // EE88 field → DB column mapping (khi tên khác nhau)
    fieldMap: {
      id: 'uid',
      money: 'balance',
      login_time: 'last_login_time',
      parent_user: 'user_parent_format'
    },
    uniqueKey: ['agent_id', 'uid'],
    hasDate: true
  },
  invites: {
    table: 'data_invites',
    columns: [
      'uid',
      'invite_code',
      'user_type',
      'group_id',
      'reg_count',
      'scope_reg_count',
      'recharge_count',
      'first_recharge_count',
      'register_recharge_count',
      'remark',
      'rebate_arr',
      'create_time',
      'update_time'
    ],
    fieldMap: { id: 'ee88_id' },
    idField: 'ee88_id',
    uniqueKey: ['agent_id', 'ee88_id'],
    hasDate: true
  },
  deposits: {
    table: 'data_deposits',
    columns: [
      'serial_no',
      'uid',
      'username',
      'user_parent',
      'user_parent_format',
      'user_tree',
      'group_id',
      'type',
      'amount',
      'true_amount',
      'status',
      'operator',
      'name',
      'bank_id',
      'account',
      'branch',
      'category_id',
      'merchant_id',
      'pay_type',
      'trade_id',
      'firm_fee',
      'user_fee',
      'rebate',
      'prize_amount',
      'activity_id',
      'currency',
      'remark',
      'user_remark',
      'is_tester',
      'create_time',
      'success_time',
      'review_time',
      'transfer_time'
    ],
    uniqueKey: ['agent_id', 'serial_no'],
    hasDate: true
  },
  withdrawals: {
    table: 'data_withdrawals',
    columns: [
      'serial_no',
      'uid',
      'username',
      'user_parent',
      'user_parent_format',
      'user_tree',
      'group_id',
      'amount',
      'true_amount',
      'name',
      'bank_id',
      'account',
      'branch',
      'status',
      'status_format',
      'operator',
      'firm_fee',
      'user_fee',
      'rebate',
      'category_id',
      'merchant_id',
      'pay_type',
      'trade_id',
      'currency',
      'remark',
      'user_remark',
      'is_tester',
      'create_time',
      'success_time',
      'review_time',
      'transfer_time'
    ],
    uniqueKey: ['agent_id', 'serial_no'],
    hasDate: true
  },
  'bet-orders': {
    table: 'data_bet_orders',
    columns: [
      'serial_no',
      'uid',
      'username',
      'platform_id',
      'platform_id_name',
      'cid',
      'c_name',
      'game_name',
      'bet_amount',
      'turnover',
      'prize',
      'win_lose',
      'bet_time',
      'platform_username'
    ],
    uniqueKey: ['agent_id', 'serial_no'],
    hasDate: true
  },
  'report-lottery': {
    table: 'data_report_lottery',
    columns: [
      'uid',
      'username',
      'user_parent_format',
      'lottery_id',
      'lottery_name',
      'bet_count',
      'bet_amount',
      'valid_amount',
      'rebate_amount',
      'prize',
      'result',
      'win_lose'
    ],
    uniqueKey: ['agent_id', 'date_key', 'uid', 'lottery_id'],
    hasDate: true,
    needsDateKey: true,
    defaultSort: 'bet_amount'
  },
  'report-funds': {
    table: 'data_report_funds',
    columns: [
      'uid',
      'username',
      'user_parent',
      'user_parent_format',
      'date',
      'deposit_count',
      'deposit_amount',
      'withdrawal_count',
      'withdrawal_amount',
      'charge_fee',
      'agent_commission',
      'promotion',
      'third_rebate',
      'third_activity_amount'
    ],
    uniqueKey: ['agent_id', 'date_key', 'uid'],
    hasDate: true,
    needsDateKey: true,
    defaultSort: 'deposit_amount'
  },
  'report-third': {
    table: 'data_report_third',
    columns: [
      'uid',
      'username',
      'platform_id',
      'platform_id_name',
      't_bet_amount',
      't_bet_times',
      't_turnover',
      't_prize',
      't_win_lose'
    ],
    uniqueKey: ['agent_id', 'date_key', 'uid', 'platform_id'],
    hasDate: true,
    needsDateKey: true,
    defaultSort: 't_bet_amount'
  },
  'lottery-bets': {
    table: 'data_lottery_bets',
    columns: [
      'serial_no',
      'uid',
      'username',
      'lottery_name',
      'play_type_name',
      'play_name',
      'issue',
      'content',
      'money',
      'rebate_amount',
      'result',
      'status_text',
      'create_time'
    ],
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

    const dateDisplay = dateKey ? dateKey.split('|')[0] : '';
    log.info(
      `[${endpointKey}] Saved ${saved}/${rows.length} rows for agent=${agentId}` +
        (dateDisplay ? ` date=${dateDisplay}` : '')
    );
  } catch (err) {
    log.error(
      `[${endpointKey}] Save failed for agent=${agentId}: ${err.message}`
    );
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
  values.push(
    Object.keys(extraObj).length > 0 ? JSON.stringify(extraObj) : null
  );

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
    db.prepare(
      `
      INSERT OR REPLACE INTO data_totals (agent_id, endpoint_key, date_key, total_json, synced_at)
      VALUES (?, ?, ?, ?, datetime('now', 'localtime'))
    `
    ).run(agentId, endpointKey, dateKey, JSON.stringify(totalData));
  } catch (err) {
    log.error(
      `Save totals failed: agent=${agentId} ep=${endpointKey}: ${err.message}`
    );
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
  const {
    agentId,
    dateKey,
    page = 1,
    limit = 50,
    search,
    orderBy,
    order = 'DESC'
  } = options;

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
  const countRow = db
    .prepare(`SELECT COUNT(*) as cnt FROM ${mapping.table} ${where}`)
    .get(...params);

  // Data
  const validOrder = order === 'ASC' ? 'ASC' : 'DESC';
  const orderCol = mapping.columns.includes(orderBy) ? orderBy : 'id';
  const offset = (page - 1) * limit;

  const rows = db
    .prepare(
      `
    SELECT * FROM ${mapping.table} ${where}
    ORDER BY ${orderCol} ${validOrder}
    LIMIT ? OFFSET ?
  `
    )
    .all(...params, limit, offset);

  return { data: rows, count: countRow.cnt };
}

/**
 * Query totals từ bảng data_totals
 */
function queryTotals(endpointKey, agentId, dateKey) {
  const db = getDb();
  const row = db
    .prepare(
      'SELECT total_json FROM data_totals WHERE agent_id = ? AND endpoint_key = ? AND date_key = ?'
    )
    .get(agentId, endpointKey, dateKey);

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
    const row = db
      .prepare(`SELECT COUNT(*) as cnt FROM ${mapping.table}`)
      .get();
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
  log.info(
    `Cleared ${result.changes} rows from ${mapping.table}` +
      (agentId ? ` agent=${agentId}` : '')
  );
  return result.changes;
}

/**
 * Lấy danh sách endpoints có data
 */
function getEndpointList() {
  return Object.keys(COLUMN_MAP);
}

// ═══════════════════════════════════════
// ── Hydrate DB rows → API-compatible ──
// ═══════════════════════════════════════

/**
 * Chuyển DB rows về đúng field names gốc của EE88 API:
 * 1. Parse extra JSON → merge vào row
 * 2. Reverse fieldMap (dbCol → apiField): balance → money, uid → id, ...
 */
function hydrateRows(rows, mapping) {
  const fieldMap = mapping.fieldMap;
  // Build reverse: { dbCol: apiField } — e.g. { balance: 'money', uid: 'id' }
  let reverseMap = null;
  if (fieldMap) {
    reverseMap = {};
    for (const [apiField, dbCol] of Object.entries(fieldMap)) {
      reverseMap[dbCol] = apiField;
    }
  }

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // 1. Merge extra JSON
    if (row.extra) {
      try {
        const extra =
          typeof row.extra === 'string' ? JSON.parse(row.extra) : row.extra;
        for (const k in extra) {
          if (row[k] === undefined) row[k] = extra[k];
        }
      } catch (e) {
        /* ignore parse errors */
      }
      delete row.extra;
    }

    // 2. Reverse fieldMap: copy dbCol value to apiField name
    if (reverseMap) {
      for (const [dbCol, apiField] of Object.entries(reverseMap)) {
        if (row[dbCol] !== undefined && row[apiField] === undefined) {
          row[apiField] = row[dbCol];
        }
      }
    }
  }

  return rows;
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
    case 'invites':
      return 'create_time';
    case 'bet-orders':
      return 'bet_time';
    case 'members':
      return 'register_time';
    default:
      return null;
  }
}

/**
 * Query data từ DB local — SQLite-first display query
 * Hỗ trợ đầy đủ client params: pagination, date range, filter columns
 *
 * @param {number[]} agentIds — danh sách agent ID
 * @param {string} endpointKey
 * @param {object} params — client query params (page, limit, create_time, username, status, ...)
 * @returns {{ data: Array, count: number, totalData: object|null } | null}
 */
function queryLocal(agentIds, endpointKey, params) {
  const mapping = COLUMN_MAP[endpointKey];
  if (!mapping || !agentIds || agentIds.length === 0) return null;

  const db = getDb();
  const page = parseInt(params.page) || 1;
  const limit = parseInt(params.limit) || 10;
  const placeholders = agentIds.map(() => '?').join(',');
  let where = `WHERE agent_id IN (${placeholders})`;
  const queryParams = [...agentIds];

  // ── Date range filter ──
  // Hỗ trợ nhiều date params: create_time, bet_time, date, first_deposit_time, user_register_time
  const dateParam =
    params.create_time ||
    params.bet_time ||
    params.date ||
    params.first_deposit_time ||
    params.user_register_time;
  if (dateParam) {
    const parts = dateParam.split('|').map((s) => s.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      const startDate = parts[0];
      const endDate = parts[1];

      if (mapping.needsDateKey) {
        where += ' AND date_key >= ? AND date_key <= ?';
        queryParams.push(startDate + '|' + startDate, endDate + '|' + endDate);
      } else if (mapping.hasDate) {
        // user_register_time cho invites → filter trên extra JSON (user_register_time)
        // first_deposit_time cho members → filter trên extra JSON
        let dateCol;
        if (params.user_register_time) {
          dateCol = 'user_register_time';
        } else if (params.first_deposit_time) {
          dateCol = 'first_deposit_time';
        } else {
          dateCol = getDateColumn(endpointKey);
        }
        if (dateCol) {
          where += ` AND ${dateCol} >= ? AND ${dateCol} <= ?`;
          queryParams.push(startDate, endDate + ' 23:59:59');
        }
      }
    }
  }

  // ── Column filters (chỉ apply nếu cột tồn tại trong bảng) ──
  const filterCols = [
    'username',
    'status',
    'type',
    'serial_no',
    'platform_username',
    'lottery_id',
    'platform_id',
    'invite_code',
    'lottery_name',
    'play_type_name',
    'play_name',
    'status_text'
  ];
  for (const col of filterCols) {
    if (
      params[col] !== undefined &&
      params[col] !== '' &&
      mapping.columns.includes(col)
    ) {
      where += ` AND ${col} = ?`;
      queryParams.push(params[col]);
    }
  }

  try {
    const countRow = db
      .prepare(`SELECT COUNT(*) as cnt FROM ${mapping.table} ${where}`)
      .get(...queryParams);
    if (!countRow || countRow.cnt === 0) return null;

    // ── Dynamic ORDER BY ──
    // sort_field mapping: client field → DB column (qua fieldMap)
    let orderCol = 'id';
    let orderDir = 'DESC';

    if (params.sort_field) {
      // Reverse fieldMap: tìm DB column từ client field name
      let dbCol = params.sort_field;
      if (mapping.fieldMap && mapping.fieldMap[params.sort_field]) {
        dbCol = mapping.fieldMap[params.sort_field];
      }
      if (mapping.columns.includes(dbCol)) {
        orderCol = dbCol;
      }
    } else if (
      mapping.defaultSort &&
      mapping.columns.includes(mapping.defaultSort)
    ) {
      // Dùng sort mặc định theo endpoint (VD: bet_amount cho report-lottery)
      orderCol = mapping.defaultSort;
    } else {
      // Fallback: date column hoặc id
      const dateCol = getDateColumn(endpointKey);
      if (dateCol && mapping.columns.includes(dateCol)) {
        orderCol = dateCol;
      }
    }

    if (params.sort_direction === 'asc' || params.sort_direction === 'ASC') {
      orderDir = 'ASC';
    }

    const offset = (page - 1) * limit;
    const rows = db
      .prepare(
        `
      SELECT * FROM ${mapping.table} ${where}
      ORDER BY ${orderCol} ${orderDir}
      LIMIT ? OFFSET ?
    `
      )
      .all(...queryParams, limit, offset);

    // Aggregate total_data từ data_totals (chỉ cho report endpoints có date)
    let totalData = null;
    if (dateParam && mapping.needsDateKey) {
      const parts = dateParam.split('|').map((s) => s.trim());
      if (parts.length === 2 && parts[0] && parts[1]) {
        const startKey = parts[0] + '|' + parts[0];
        const endKey = parts[1] + '|' + parts[1];
        const totalsRows = db
          .prepare(
            `SELECT total_json FROM data_totals
           WHERE endpoint_key = ? AND agent_id IN (${placeholders})
           AND date_key >= ? AND date_key <= ?`
          )
          .all(endpointKey, ...agentIds, startKey, endKey);

        for (const row of totalsRows) {
          try {
            const t = JSON.parse(row.total_json);
            if (!totalData) {
              totalData = { ...t };
            } else {
              for (const k in t) {
                const v = parseFloat(t[k]);
                if (!isNaN(v))
                  totalData[k] = (parseFloat(totalData[k]) || 0) + v;
              }
            }
          } catch (e) {
            /* ignore */
          }
        }
      }
    }

    // Post-process: merge extra JSON + reverse fieldMap → trả về đúng field names gốc của API
    const processed = hydrateRows(rows, mapping);

    return { data: processed, count: countRow.cnt, totalData };
  } catch (err) {
    log.error(`queryLocal [${endpointKey}] error: ${err.message}`);
    return null;
  }
}

/**
 * Xoá data của 1 ngày cụ thể cho 1 agent + endpoint
 * Dùng khi cần re-sync ngày (xoá data cũ trước khi insert mới)
 */
function deleteDataForDay(agentId, endpointKey, dateStr) {
  const mapping = COLUMN_MAP[endpointKey];
  if (!mapping) return 0;

  const db = getDb();
  let result;

  if (mapping.needsDateKey) {
    // report-lottery, report-funds, report-third — filter by date_key
    const dateKey = dateStr + '|' + dateStr;
    result = db
      .prepare(
        `DELETE FROM ${mapping.table} WHERE agent_id = ? AND date_key = ?`
      )
      .run(agentId, dateKey);
  } else {
    // deposits, withdrawals, lottery-bets — filter by timestamp column
    const dateCol = getDateColumn(endpointKey);
    if (!dateCol) return 0;
    result = db
      .prepare(
        `DELETE FROM ${mapping.table} WHERE agent_id = ? AND ${dateCol} >= ? AND ${dateCol} <= ?`
      )
      .run(agentId, dateStr + ' 00:00:00', dateStr + ' 23:59:59');
  }

  // Xoá totals nếu có
  try {
    const dateKey = dateStr + '|' + dateStr;
    db.prepare(
      'DELETE FROM data_totals WHERE agent_id = ? AND endpoint_key = ? AND date_key = ?'
    ).run(agentId, endpointKey, dateKey);
  } catch (e) {
    /* ignore */
  }

  return result.changes;
}

module.exports = {
  saveData,
  saveTotals,
  queryData,
  queryTotals,
  queryLocal,
  getDataStats,
  clearData,
  deleteDataForDay,
  getEndpointList,
  COLUMN_MAP
};
