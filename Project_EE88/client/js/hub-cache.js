/**
 * Hub Client Cache — Session-level cache dùng sessionStorage
 * Giảm API calls trùng lặp trong cùng phiên trình duyệt
 *
 * Sử dụng:
 *   HubCache.get(endpoint, params)  → data | null (nếu hết hạn)
 *   HubCache.set(endpoint, params, data)
 *   HubCache.clear()
 */
var HubCache = (function () {
  var TTL_LIVE = 2 * 60 * 1000;   // 2 phút cho data hôm nay
  var TTL_PAST = 30 * 60 * 1000;  // 30 phút cho data ngày cũ
  var PREFIX = 'hc_';

  function _key(endpoint, params) {
    var sorted = Object.keys(params || {}).sort().map(function (k) {
      return k + '=' + params[k];
    }).join('&');
    return PREFIX + endpoint + '?' + sorted;
  }

  /**
   * Kiểm tra date trong params có phải hôm nay không
   */
  function _isToday(params) {
    var today = new Date();
    var y = today.getFullYear();
    var m = String(today.getMonth() + 1).padStart(2, '0');
    var d = String(today.getDate()).padStart(2, '0');
    var todayStr = y + '-' + m + '-' + d;

    // Kiểm tra các param date phổ biến
    var dateFields = ['end_time', 'start_time', 'hs_date_time'];
    for (var i = 0; i < dateFields.length; i++) {
      var val = params[dateFields[i]];
      if (val && String(val).indexOf(todayStr) !== -1) return true;
    }

    // Không có date param → coi như realtime
    var hasDate = false;
    for (var j = 0; j < dateFields.length; j++) {
      if (params[dateFields[j]]) { hasDate = true; break; }
    }
    if (!hasDate) return true;

    return false;
  }

  return {
    /**
     * Lấy cache nếu còn hiệu lực
     */
    get: function (endpoint, params) {
      try {
        var key = _key(endpoint, params);
        var raw = sessionStorage.getItem(key);
        if (!raw) return null;

        var entry = JSON.parse(raw);
        var now = Date.now();
        if (now - entry.ts > entry.ttl) {
          sessionStorage.removeItem(key);
          return null;
        }
        return entry.data;
      } catch (e) {
        return null;
      }
    },

    /**
     * Lưu vào cache
     */
    set: function (endpoint, params, data) {
      try {
        var key = _key(endpoint, params);
        var ttl = _isToday(params) ? TTL_LIVE : TTL_PAST;
        sessionStorage.setItem(key, JSON.stringify({
          ts: Date.now(),
          ttl: ttl,
          data: data
        }));
      } catch (e) {
        // sessionStorage full → xoá hết cache cũ
        try {
          var keys = [];
          for (var i = 0; i < sessionStorage.length; i++) {
            var k = sessionStorage.key(i);
            if (k && k.indexOf(PREFIX) === 0) keys.push(k);
          }
          keys.forEach(function (k) { sessionStorage.removeItem(k); });
        } catch (e2) { /* ignore */ }
      }
    },

    /**
     * Xoá toàn bộ cache
     */
    clear: function () {
      try {
        var keys = [];
        for (var i = 0; i < sessionStorage.length; i++) {
          var k = sessionStorage.key(i);
          if (k && k.indexOf(PREFIX) === 0) keys.push(k);
        }
        keys.forEach(function (k) { sessionStorage.removeItem(k); });
      } catch (e) { /* ignore */ }
    }
  };
})();
