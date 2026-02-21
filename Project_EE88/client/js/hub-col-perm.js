/**
 * HubColPerm — Client-side column permission filter (deny-list).
 * Đọc localStorage('hub_hidden_cols') để lọc cột bị ẩn trước khi table.render().
 *
 * Usage:
 *   cols: [HubColPerm.filterCols('pageId', [... col definitions ...])]
 */
var HubColPerm = {
  STORAGE_KEY: 'hub_hidden_cols',

  /**
   * Lọc bỏ các cột bị ẩn cho pageId.
   * @param {string} pageId - ID trang (vd: 'members', 'reportLottery')
   * @param {Array} cols - Mảng col definition của layui table
   * @returns {Array} cols đã lọc
   */
  filterCols: function (pageId, cols) {
    var hidden = this._getHidden(pageId);
    if (!hidden || hidden.length === 0) return cols;
    return cols.filter(function (col) {
      // Giữ lại cols không có field (checkbox, action columns...)
      if (!col.field) return true;
      return hidden.indexOf(col.field) === -1;
    });
  },

  /**
   * Lưu hiddenColumns từ API response vào localStorage.
   * @param {Object} hiddenColumns - { pageId: ['field1', 'field2'], ... }
   */
  save: function (hiddenColumns) {
    if (!hiddenColumns || typeof hiddenColumns !== 'object') {
      localStorage.removeItem(this.STORAGE_KEY);
      return;
    }
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(hiddenColumns));
  },

  /** Xoá localStorage khi logout. */
  clear: function () {
    localStorage.removeItem(this.STORAGE_KEY);
  },

  /** @private Đọc danh sách field bị ẩn cho pageId. */
  _getHidden: function (pageId) {
    try {
      var data = JSON.parse(localStorage.getItem(this.STORAGE_KEY));
      return data && data[pageId] ? data[pageId] : null;
    } catch (e) {
      return null;
    }
  }
};
