/**
 * Phase 4: Chuẩn hoá response từ ee88 về format thống nhất
 * { code, msg, count, data, total_data }
 */

/**
 * @param {object} raw — response gốc từ ee88
 * @returns {object} response đã chuẩn hoá
 */
function normalize(raw) {
  return {
    code: raw.code === 0 || raw.code === 1 ? 0 : raw.code,
    msg: raw.msg || '',
    count: raw.count || 0,
    data: raw.data || [],
    total_data: raw.total_data || null
  };
}

module.exports = { normalize };
