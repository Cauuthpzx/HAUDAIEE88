/**
 * Phase 4: Map + clean params trước khi gửi ee88
 * Xoá params rỗng, đảm bảo page/limit có giá trị mặc định
 */

/**
 * @param {object} rawParams — params từ frontend (req.query)
 * @param {object} defaults — defaultParams từ endpoint config
 * @returns {object} params đã clean
 */
function mapParams(rawParams = {}, defaults = {}) {
  const merged = { ...defaults, ...rawParams };

  // Xoá params rỗng / undefined
  const cleaned = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null && value !== '') {
      cleaned[key] = value;
    }
  }

  return cleaned;
}

module.exports = { mapParams };
