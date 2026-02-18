const { getDb } = require('../database/init');
const { createLogger } = require('../utils/logger');

const log = createLogger('cache');

// Endpoints không có date range → không cache
const NON_CACHEABLE = new Set(['members', 'invites']);

// Map endpoint → tên param ngày
const DATE_PARAM_MAP = {
  deposits:               { start: 'start_time', end: 'end_time' },
  withdrawals:            { start: 'start_time', end: 'end_time' },
  'bet-orders':           { start: 'start_time', end: 'end_time' },
  'report-lottery':       { start: 'start_time', end: 'end_time' },
  'report-funds':         { start: 'start_time', end: 'end_time' },
  'report-third':         { start: 'start_time', end: 'end_time' },
  'lottery-bets':         { type: 'range', param: 'hs_date_time', sep: '|' },
  'lottery-bets-summary': { type: 'range', param: 'hs_date_time', sep: '|' }
};

/**
 * Lấy ngày hôm nay dạng YYYY-MM-DD (local time)
 */
function getToday() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Lấy ngày hôm qua dạng YYYY-MM-DD
 */
function getYesterday() {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Trích xuất phần date YYYY-MM-DD từ chuỗi datetime
 */
function extractDate(str) {
  if (!str) return null;
  const match = String(str).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Phân tích date range từ params của endpoint
 * @returns {{ cacheable: boolean, dateKey: string|null, startDate: string|null, endDate: string|null, isToday: boolean }}
 */
function extractDateRange(endpointKey, params) {
  const result = { cacheable: false, dateKey: null, startDate: null, endDate: null, isToday: false };

  if (NON_CACHEABLE.has(endpointKey)) return result;

  const mapping = DATE_PARAM_MAP[endpointKey];
  if (!mapping) return result;

  let startDate, endDate;

  if (mapping.type === 'range') {
    // "YYYY-MM-DD HH:mm:ss|YYYY-MM-DD HH:mm:ss"
    const val = params[mapping.param];
    if (!val) return result;
    const parts = String(val).split(mapping.sep);
    startDate = extractDate(parts[0]);
    endDate = extractDate(parts[1] || parts[0]);
  } else {
    startDate = extractDate(params[mapping.start]);
    endDate = extractDate(params[mapping.end]);
  }

  if (!startDate || !endDate) return result;

  const today = getToday();
  const includestoday = endDate >= today;

  result.startDate = startDate;
  result.endDate = endDate;
  result.dateKey = startDate + '|' + endDate;
  result.isToday = includestoday;
  result.cacheable = !includestoday;

  return result;
}

/**
 * Kiểm tra endpoint có cacheable không
 */
function isCacheableEndpoint(endpointKey) {
  return !NON_CACHEABLE.has(endpointKey) && !!DATE_PARAM_MAP[endpointKey];
}

/**
 * Lấy danh sách endpoint keys có thể cache
 */
function getCacheableEndpoints() {
  return Object.keys(DATE_PARAM_MAP);
}

// ═══════════════════════════════════════
// ── Cache CRUD ──
// ═══════════════════════════════════════

/**
 * Đọc cache
 * @returns {{ data: Array, totalData: object|null, rowCount: number }} | null
 */
function getCache(agentId, endpointKey, dateKey) {
  const db = getDb();
  const row = db.prepare(
    'SELECT response_json, total_data_json, row_count FROM cache_data WHERE agent_id = ? AND endpoint_key = ? AND date_key = ?'
  ).get(agentId, endpointKey, dateKey);

  if (!row) return null;

  try {
    return {
      data: JSON.parse(row.response_json),
      totalData: row.total_data_json ? JSON.parse(row.total_data_json) : null,
      rowCount: row.row_count
    };
  } catch (err) {
    log.error(`Lỗi parse cache: agent=${agentId} ep=${endpointKey} date=${dateKey}`, { error: err.message });
    return null;
  }
}



/**
 * Ghi cache (INSERT OR REPLACE)
 */
function setCache(agentId, endpointKey, dateKey, data, totalData, rowCount) {
  const db = getDb();
  try {
    db.prepare(`
      INSERT OR REPLACE INTO cache_data (agent_id, endpoint_key, date_key, response_json, total_data_json, row_count, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(
      agentId,
      endpointKey,
      dateKey,
      JSON.stringify(data || []),
      totalData ? JSON.stringify(totalData) : null,
      rowCount || 0
    );
    log.info(`Cache SET: agent=${agentId} ep=${endpointKey} date=${dateKey} rows=${rowCount || 0}`);
  } catch (err) {
    log.error(`Lỗi ghi cache: agent=${agentId} ep=${endpointKey}`, { error: err.message });
  }
}

/**
 * Khoá cache cho 1 entry
 */
function lockDate(agentId, endpointKey, dateKey) {
  const db = getDb();
  db.prepare(
    'UPDATE cache_data SET locked = 1 WHERE agent_id = ? AND endpoint_key = ? AND date_key = ?'
  ).run(agentId, endpointKey, dateKey);
}

/**
 * Khoá tất cả cache chứa dateStr trong date_key
 */
function lockAllForDate(dateStr) {
  const db = getDb();
  const pattern = dateStr + '|' + dateStr;
  const result = db.prepare(
    'UPDATE cache_data SET locked = 1 WHERE date_key = ?'
  ).run(pattern);
  log.info(`Lock all cache for date ${dateStr}: ${result.changes} entries`);
  return result.changes;
}

/**
 * Kiểm tra đã cache chưa
 */
function isCached(agentId, endpointKey, dateKey) {
  const db = getDb();
  const row = db.prepare(
    'SELECT 1 FROM cache_data WHERE agent_id = ? AND endpoint_key = ? AND date_key = ?'
  ).get(agentId, endpointKey, dateKey);
  return !!row;
}

/**
 * Thống kê cache
 */
function getCacheStats() {
  const db = getDb();

  const total = db.prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(row_count), 0) as rows FROM cache_data').get();
  const locked = db.prepare('SELECT COUNT(DISTINCT date_key) as cnt FROM cache_data WHERE locked = 1').get();
  const oldest = db.prepare('SELECT MIN(date_key) as val FROM cache_data').get();
  const newest = db.prepare('SELECT MAX(date_key) as val FROM cache_data').get();
  const lastSync = db.prepare('SELECT MAX(synced_at) as val FROM cache_data').get();

  return {
    totalEntries: total.cnt,
    totalRows: total.rows,
    lockedDays: locked.cnt,
    oldestDate: oldest.val,
    newestDate: newest.val,
    lastSyncTime: lastSync.val
  };
}

/**
 * Xoá cache (với filter tuỳ chọn)
 */
function clearCache(agentId, endpointKey, dateKey) {
  const db = getDb();
  let sql = 'DELETE FROM cache_data WHERE 1=1';
  const params = [];

  if (agentId) { sql += ' AND agent_id = ?'; params.push(agentId); }
  if (endpointKey) { sql += ' AND endpoint_key = ?'; params.push(endpointKey); }
  if (dateKey) { sql += ' AND date_key = ?'; params.push(dateKey); }

  const result = db.prepare(sql).run(...params);
  log.info(`Cache CLEAR: ${result.changes} entries deleted`, { agentId, endpointKey, dateKey });
  return result.changes;
}

/**
 * Lấy danh sách ngày đã cache
 */
function getCachedDates(agentId, endpointKey) {
  const db = getDb();
  let sql = `
    SELECT date_key, agent_id, endpoint_key, row_count, locked, synced_at
    FROM cache_data WHERE 1=1
  `;
  const params = [];
  if (agentId) { sql += ' AND agent_id = ?'; params.push(agentId); }
  if (endpointKey) { sql += ' AND endpoint_key = ?'; params.push(endpointKey); }
  sql += ' ORDER BY date_key DESC';

  return db.prepare(sql).all(...params);
}

// ═══════════════════════════════════════
// ── Sync Logs ──
// ═══════════════════════════════════════

function logSync(agentId, endpointKey, dateStr, status, rowCount, errorMsg) {
  const db = getDb();
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);

  if (status === 'syncing') {
    db.prepare(`
      INSERT INTO sync_logs (agent_id, endpoint_key, date_str, status, started_at)
      VALUES (?, ?, ?, 'syncing', ?)
    `).run(agentId, endpointKey, dateStr, now);
  } else {
    // Update latest syncing record
    const existing = db.prepare(`
      SELECT id FROM sync_logs
      WHERE agent_id = ? AND endpoint_key = ? AND date_str = ? AND status = 'syncing'
      ORDER BY id DESC LIMIT 1
    `).get(agentId, endpointKey, dateStr);

    if (existing) {
      db.prepare(`
        UPDATE sync_logs SET status = ?, row_count = ?, error_msg = ?, completed_at = ?
        WHERE id = ?
      `).run(status, rowCount || 0, errorMsg || null, now, existing.id);
    } else {
      db.prepare(`
        INSERT INTO sync_logs (agent_id, endpoint_key, date_str, status, row_count, error_msg, started_at, completed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(agentId, endpointKey, dateStr, status, rowCount || 0, errorMsg || null, now, now);
    }
  }
}

/**
 * Lấy sync logs (phân trang + filter)
 */
function getSyncLogs(options) {
  const db = getDb();
  const { page = 1, limit = 20, agentId, endpointKey, status, dateStr } = options || {};

  let where = 'WHERE 1=1';
  const params = [];
  if (agentId) { where += ' AND s.agent_id = ?'; params.push(agentId); }
  if (endpointKey) { where += ' AND s.endpoint_key = ?'; params.push(endpointKey); }
  if (status) { where += ' AND s.status = ?'; params.push(status); }
  if (dateStr) { where += ' AND s.date_str = ?'; params.push(dateStr); }

  const countRow = db.prepare(`SELECT COUNT(*) as cnt FROM sync_logs s ${where}`).get(...params);

  const offset = (page - 1) * limit;
  const rows = db.prepare(`
    SELECT s.*, a.label as agent_label
    FROM sync_logs s
    LEFT JOIN ee88_agents a ON a.id = s.agent_id
    ${where}
    ORDER BY s.id DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  return { count: countRow.cnt, data: rows };
}

// ═══════════════════════════════════════
// ── Build date params cho sync ──
// ═══════════════════════════════════════

/**
 * Tạo params ngày cho endpoint (dùng cho cron sync)
 */
function buildDateParams(endpointKey, startDate, endDate) {
  const mapping = DATE_PARAM_MAP[endpointKey];
  if (!mapping) return {};

  if (mapping.type === 'range') {
    return { [mapping.param]: startDate + ' 00:00:00' + mapping.sep + endDate + ' 23:59:59' };
  }
  return { [mapping.start]: startDate, [mapping.end]: endDate };
}

/**
 * Lấy tree data cho treeTable: Agent → Endpoints
 */
function getCacheTree() {
  const db = getDb();
  const allEndpoints = getCacheableEndpoints();

  const agents = db.prepare('SELECT id, label, status FROM ee88_agents ORDER BY id').all();

  // Cache summary per agent + endpoint
  const cacheRows = db.prepare(`
    SELECT agent_id, endpoint_key,
      COUNT(*) as date_count,
      COALESCE(SUM(row_count), 0) as total_rows,
      COALESCE(SUM(locked), 0) as locked_count,
      MAX(synced_at) as last_sync
    FROM cache_data
    GROUP BY agent_id, endpoint_key
  `).all();

  // Distinct date counts per agent (for parent-level rollup)
  const agentDateStats = db.prepare(`
    SELECT agent_id,
      COUNT(DISTINCT date_key) as unique_dates,
      COUNT(DISTINCT CASE WHEN locked = 1 THEN date_key END) as unique_locked_dates
    FROM cache_data
    GROUP BY agent_id
  `).all();
  const agentDateMap = {};
  agentDateStats.forEach(r => { agentDateMap[r.agent_id] = r; });

  // Latest sync log per agent + endpoint
  const logRows = db.prepare(`
    SELECT s.agent_id, s.endpoint_key, s.status, s.error_msg,
      COALESCE(s.completed_at, s.started_at) as last_time
    FROM sync_logs s
    INNER JOIN (
      SELECT agent_id, endpoint_key, MAX(id) as max_id
      FROM sync_logs GROUP BY agent_id, endpoint_key
    ) latest ON s.id = latest.max_id
  `).all();

  // Lookup maps
  const cacheMap = {};
  cacheRows.forEach(r => { cacheMap[r.agent_id + '_' + r.endpoint_key] = r; });
  const logMap = {};
  logRows.forEach(r => { logMap[r.agent_id + '_' + r.endpoint_key] = r; });

  return agents.map(agent => {
    const children = allEndpoints.map((ep, i) => {
      const key = agent.id + '_' + ep;
      const cache = cacheMap[key];
      const syncLog = logMap[key];

      return {
        id: agent.id * 10000 + i + 1,
        name: ep,
        is_parent: false,
        sync_status: syncLog ? syncLog.status : (cache ? 'success' : 'none'),
        row_count: cache ? cache.total_rows : 0,
        date_count: cache ? cache.date_count : 0,
        locked_count: cache ? cache.locked_count : 0,
        last_sync: cache ? cache.last_sync : (syncLog ? syncLog.last_time : ''),
        error_msg: syncLog && syncLog.status === 'error' ? (syncLog.error_msg || '') : ''
      };
    });

    const syncedCount = children.filter(c => c.sync_status === 'success').length;
    const totalRows = children.reduce((s, c) => s + c.row_count, 0);
    const dateStats = agentDateMap[agent.id] || { unique_dates: 0, unique_locked_dates: 0 };
    const totalDates = dateStats.unique_dates;
    const totalLocked = dateStats.unique_locked_dates;
    const lastSync = children.reduce((l, c) => c.last_sync > l ? c.last_sync : l, '');

    return {
      id: agent.id,
      name: agent.label,
      is_parent: true,
      agent_status: agent.status,
      synced_count: syncedCount,
      total_endpoints: allEndpoints.length,
      progress: allEndpoints.length > 0 ? Math.round((syncedCount / allEndpoints.length) * 100) : 0,
      sync_status: agent.status === 1 ? 'active' : 'expired',
      row_count: totalRows,
      date_count: totalDates,
      locked_count: totalLocked,
      last_sync: lastSync,
      error_msg: '',
      children: children
    };
  });
}

module.exports = {
  getToday,
  getYesterday,
  extractDateRange,
  isCacheableEndpoint,
  getCacheableEndpoints,
  getCache,
  setCache,
  lockDate,
  lockAllForDate,
  isCached,
  getCacheStats,
  clearCache,
  getCachedDates,
  logSync,
  getSyncLogs,
  buildDateParams,
  getCacheTree
};
