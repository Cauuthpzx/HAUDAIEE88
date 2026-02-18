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

  // ── Stale-while-revalidate: poll cho đến khi có data mới từ EE88 ──
  var _localReloadTimers = {};
  var _localReloadAttempts = {};
  var POLL_INTERVAL = 2000;  // 2s mỗi lần poll
  var MAX_POLL_ATTEMPTS = 15; // tối đa 30s

  function scheduleLocalReload(tableId) {
    if (!tableId) return;
    if (!_localReloadAttempts[tableId]) _localReloadAttempts[tableId] = 0;
    _localReloadAttempts[tableId]++;
    if (_localReloadAttempts[tableId] > MAX_POLL_ATTEMPTS) {
      delete _localReloadAttempts[tableId];
      return;
    }
    if (_localReloadTimers[tableId]) clearTimeout(_localReloadTimers[tableId]);
    _localReloadTimers[tableId] = setTimeout(function () {
      delete _localReloadTimers[tableId];
      try {
        layui.table.reload(tableId);
      } catch (e) {
        // Reload lỗi tạm → thử lại lần sau thay vì dừng hẳn
        scheduleLocalReload(tableId);
      }
    }, POLL_INTERVAL);
  }

  function stopLocalReload(tableId) {
    delete _localReloadAttempts[tableId];
    if (_localReloadTimers[tableId]) {
      clearTimeout(_localReloadTimers[tableId]);
      delete _localReloadTimers[tableId];
    }
  }

  /**
   * Standard parseData function for layui table
   * fromLocal=true → poll mỗi 2s; fromLocal=false → data mới, dừng poll
   */
  function parseData(res) {
    res = res || {};
    // this = table options (layui gọi parseData.call(options, res))
    if (this && this.id) {
      if (res.fromLocal) {
        scheduleLocalReload(this.id);
      } else if (_localReloadAttempts[this.id]) {
        stopLocalReload(this.id);
      }
    }
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
    return parseData.call(this, res);
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

  /**
   * Default toolbar config with Excel export button
   */
  function getDefaultToolbar() {
    return [
      'filter', 'print',
      {
        title: HubLang.t('exportExcel'),
        layEvent: 'LAYTABLE_XLSX',
        icon: 'hi hi-file-export'
      }
    ];
  }

  /**
   * Export layui table data to XLSX via SheetJS
   * @param {string} tableId — layui table id
   * @param {string} filename — base filename (without extension)
   */
  function exportExcel(tableId, filename) {
    if (typeof XLSX === 'undefined') {
      // Lazy-load XLSX on first export
      var script = document.createElement('script');
      script.src = '/lib/xlsx/xlsx.mini.min.js';
      var _tid = tableId, _fn = filename;
      script.onload = function () { exportExcel(_tid, _fn); };
      script.onerror = function () { layui.layer.msg('Failed to load SheetJS', { icon: 2 }); };
      layui.layer.msg(HubLang.t('loading') || 'Loading...', { icon: 16, shade: 0.1, time: 5000, id: 'xlsxLoad' });
      document.body.appendChild(script);
      return;
    }

    var table = layui.table;
    var data = table.cache[tableId];
    if (!data || data.length === 0) {
      layui.layer.msg(HubLang.t('noData'), { icon: 0 });
      return;
    }

    // Get column config from layui table internal state
    var tableConfig = null;
    try {
      var thatTable = table.getOptions(tableId);
      if (thatTable) tableConfig = thatTable;
    } catch (e) { /* fallback below */ }

    // Extract visible columns
    var cols = [];
    var colSrc = tableConfig && tableConfig.cols ? tableConfig.cols[0] : null;
    if (colSrc) {
      colSrc.forEach(function (col) {
        if (col.type === 'checkbox' || col.type === 'radio') return;
        if (col.toolbar) return;
        if (col.hide) return;
        if (!col.field) return;
        cols.push({ field: col.field, title: col.title || col.field });
      });
    }

    if (cols.length === 0) {
      // Fallback: use object keys from first data row
      var keys = Object.keys(data[0]).filter(function (k) {
        return k !== 'LAY_TABLE_INDEX' && k !== 'LAY_CHECKED';
      });
      cols = keys.map(function (k) { return { field: k, title: k }; });
    }

    // Build worksheet: headers + rows
    var wsData = [cols.map(function (c) { return c.title; })];
    data.forEach(function (row) {
      if (!row || row.LAY_TABLE_INDEX === undefined && !row) return;
      wsData.push(cols.map(function (c) {
        var val = row[c.field];
        return val === null || val === undefined ? '' : val;
      }));
    });

    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = cols.map(function (c) {
      return { wch: Math.max((c.title || '').length + 4, 14) };
    });
    XLSX.utils.book_append_sheet(wb, ws, 'Data');

    var dateStr = fmt(new Date());
    XLSX.writeFile(wb, (filename || 'export') + '_' + dateStr + '.xlsx');
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
    parseRebate: parseRebate,
    getDefaultToolbar: getDefaultToolbar,
    exportExcel: exportExcel
  };
})();
