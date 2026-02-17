/**
 * Hub SPA Utilities — shared helpers for page modules
 */
var HubUtils = (function () {
  function fmt(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /**
   * Calculate quick date ranges
   * Returns { todayStr, yesterdayStr, weekStartStr, monthStartStr, lastMonthStart, lastMonthEnd }
   */
  function getDateRanges() {
    var now = new Date();
    var todayStr = fmt(now);

    var yd = new Date(now); yd.setDate(yd.getDate() - 1);
    var yesterdayStr = fmt(yd);

    var ws = new Date(now);
    var dow = ws.getDay(); dow = dow === 0 ? 6 : dow - 1;
    ws.setDate(ws.getDate() - dow);
    var weekStartStr = fmt(ws);

    var ms = new Date(now.getFullYear(), now.getMonth(), 1);
    var monthStartStr = fmt(ms);

    var lms = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    var lme = new Date(now.getFullYear(), now.getMonth(), 0);
    var lastMonthStart = fmt(lms);
    var lastMonthEnd = fmt(lme);

    return {
      todayStr: todayStr,
      yesterdayStr: yesterdayStr,
      weekStartStr: weekStartStr,
      monthStartStr: monthStartStr,
      lastMonthStart: lastMonthStart,
      lastMonthEnd: lastMonthEnd
    };
  }

  /**
   * Setup quick date option values on select elements
   * @param {HTMLElement} container — the page container
   * @param {object} dates — from getDateRanges()
   */
  function setupQuickDates(container, dates) {
    var map = {
      'optToday': dates.todayStr + ' | ' + dates.todayStr,
      'optYesterday': dates.yesterdayStr + ' | ' + dates.yesterdayStr,
      'optWeek': dates.weekStartStr + ' | ' + dates.todayStr,
      'optMonth': dates.monthStartStr + ' | ' + dates.todayStr,
      'optLastMonth': dates.lastMonthStart + ' | ' + dates.lastMonthEnd
    };
    for (var id in map) {
      var el = container.querySelector('#' + id);
      if (el) el.value = map[id];
    }
  }

  /**
   * Render total/summary data into elements by ID
   * @param {HTMLElement} container — the page container
   * @param {object} totalData — data object from API
   * @param {string[]} fields — array of field IDs
   * @param {string[]} [intFields] — fields that should show integers (default '0' instead of '0.0000')
   */
  function renderTotalData(container, totalData, fields, intFields) {
    if (!totalData) return;
    intFields = intFields || [];
    fields.forEach(function (key) {
      var val = totalData[key];
      if (val === undefined || val === null) {
        val = intFields.indexOf(key) !== -1 ? '0' : '0.0000';
      }
      var el = container.querySelector('#' + key);
      if (el) el.textContent = val;
    });
  }

  /**
   * Standard parseData function for layui table
   */
  function parseData(res) {
    return {
      code: res.code === 0 ? 0 : 1,
      msg: res.msg || '',
      count: res.count || 0,
      data: res.data || []
    };
  }

  /**
   * Standard parseData with total_data capture
   */
  function parseDataWithTotal(res, storageKey) {
    window[storageKey] = res.total_data || null;
    return parseData(res);
  }

  /**
   * Rebate series names mapping
   */
  var SERIES_NAMES = { '1': 'MN', '2': 'MB', '3': 'MT', '4': 'XSN', '5': 'Sicbo', '6': 'XSN', '7': 'Keno', '8': 'WinGo', '9': 'Game' };

  var DEFAULT_SERIES = [
    { id: '1', name: 'MN' }, { id: '2', name: 'MB' }, { id: '3', name: 'MT' },
    { id: '4', name: 'XSN' }, { id: '5', name: 'Sicbo' }, { id: '7', name: 'Keno' },
    { id: '8', name: 'WinGo' }, { id: '9', name: 'Game' }
  ];

  /**
   * Parse rebate_arr JSON
   */
  function parseRebate(raw) {
    try {
      var obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!obj || typeof obj !== 'object') return [];
      var arr = [];
      for (var k in obj) { arr.push({ id: k, name: SERIES_NAMES[k] || k, value: obj[k].value }); }
      return arr;
    } catch (e) { return []; }
  }

  return {
    fmt: fmt,
    getDateRanges: getDateRanges,
    setupQuickDates: setupQuickDates,
    renderTotalData: renderTotalData,
    parseData: parseData,
    parseDataWithTotal: parseDataWithTotal,
    SERIES_NAMES: SERIES_NAMES,
    DEFAULT_SERIES: DEFAULT_SERIES,
    parseRebate: parseRebate
  };
})();
