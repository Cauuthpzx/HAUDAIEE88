/**
 * Passive event listener patch
 * Tắt Chrome [Violation] warning cho touchstart/touchmove/mousewheel
 */
(function () {
  var PASSIVE_EVENTS = ['touchstart', 'touchmove', 'mousewheel', 'wheel'];
  var orig = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (PASSIVE_EVENTS.indexOf(type) !== -1 && typeof opts !== 'object') {
      opts = { capture: !!opts, passive: true };
    }
    return orig.call(this, type, fn, opts);
  };
})();

/**
 * Hub API — fetch wrapper cho frontend
 * Gọi backend proxy → ee88
 */
const HubAPI = {
  /**
   * Lấy dữ liệu từ backend
   * @param {string} endpoint — tên endpoint (vd: 'members')
   * @param {object} params — query params (page, limit, username…)
   * @returns {Promise<object>} — { code, count, data[], total_data }
   */
  async fetch(endpoint, params = {}) {
    const qs = Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const url = qs ? `/api/data/${endpoint}?${qs}` : `/api/data/${endpoint}`;

    const res = await fetch(url);

    if (res.status === 401) {
      throw new Error('SESSION_EXPIRED');
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    return res.json();
  },

  /**
   * Single-panel date range picker (1 bảng lịch, chọn khoảng ngày)
   * - Click 1: chọn ngày bắt đầu (đậm)
   * - Click 2: chọn ngày kết thúc (đậm), dải giữa nhạt màu
   *
   * @param {string} elem — CSS selector (#myInput)
   * @param {object} opts — laydate options bổ sung (max, value, done…)
   * @returns laydate instance
   */
  singleRangePicker(elem, opts) {
    opts = opts || {};
    var sep = opts.separator || '|';
    var userReady = opts.ready;
    delete opts.separator;

    return layui.laydate.render(Object.assign({
      type: 'date',
      range: sep,
      rangeLinked: true
    }, opts, {
      elem: elem,
      ready: function () {
        var key = layui.$(elem).attr('lay-key');
        var el = document.getElementById('layui-laydate' + key);
        if (el) el.classList.add('laydate-single-panel');
        if (userReady) userReady.apply(this, arguments);
      }
    }));
  }
};
