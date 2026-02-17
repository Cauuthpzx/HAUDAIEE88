(function () {
  // Lottery provider options HTML
  var providerOptions = '<option value="" data-i18n="all">Tất cả</option>'
    + '<option value="8">PA</option><option value="9">BBIN</option><option value="10">WM</option>'
    + '<option value="14">MINI</option><option value="20">KY</option><option value="28">PGSOFT</option>'
    + '<option value="29">LUCKYWIN</option><option value="30">SABA</option><option value="31">PT</option>'
    + '<option value="38">RICH88</option><option value="43">ASTAR</option><option value="45">FB</option>'
    + '<option value="46">JILI</option><option value="47">KA</option><option value="48">MW</option>'
    + '<option value="50">SBO</option><option value="51">NEXTSPIN</option><option value="52">AMB</option>'
    + '<option value="53">FunTa</option><option value="62">MG</option><option value="63">WS168</option>'
    + '<option value="69">DG CASINO</option><option value="70">V8</option><option value="71">AE</option>'
    + '<option value="72">TP</option><option value="73">FC</option><option value="74">JDB</option>'
    + '<option value="75">CQ9</option><option value="76">PP</option><option value="77">VA</option>'
    + '<option value="78">BNG</option><option value="84">DB CASINO</option><option value="85">EVO CASINO</option>'
    + '<option value="90">CMD SPORTS</option><option value="91">PG NEW</option><option value="92">FBLIVE</option>'
    + '<option value="93">ON CASINO</option><option value="94">MT</option><option value="102">FC NEW</option>';

  SpaPages.reportThirdGame = {
    getHTML: function () {
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-form layui-card-header"><fieldset class="layui-elem-field">'
        + '<legend data-i18n="reportThirdTitle">Báo cáo nhà cung cấp game</legend>'
        + '<div class="layui-field-box"><form class="layui-form" lay-filter="rt_searchForm">'
        + '<div class="layui-inline"><label data-i18n="time">Thời gian</label>：'
        + '<div style="width:220px;" class="layui-input-inline">'
        + '<input type="text" name="date" id="rt_dateRange" placeholder="' + HubLang.t('dateStartEnd') + '" class="layui-input" readonly autocomplete="off"></div></div>'
        + '<div class="layui-inline"><div style="width:100px;" class="layui-input-inline">'
        + '<select lay-filter="rt_quickDateFilter" lay-search="">'
        + '<option value="" id="rt_optToday" data-i18n="today">Hôm nay</option>'
        + '<option value="" id="rt_optYesterday" data-i18n="yesterday">Hôm qua</option>'
        + '<option value="" id="rt_optWeek" data-i18n="thisWeek">Tuần này</option>'
        + '<option value="" id="rt_optMonth" data-i18n="thisMonth">Tháng này</option>'
        + '<option value="" id="rt_optLastMonth" data-i18n="lastMonth">Tháng trước</option>'
        + '</select></div></div>'
        + '<div class="layui-inline"><label data-i18n="accountName">Tên tài khoản</label>：'
        + '<div style="width:200px;" class="layui-input-inline">'
        + '<input type="text" name="username" placeholder="' + HubLang.t('enterAccountName') + '" class="layui-input" autocomplete="off"></div></div>'
        + '<div class="layui-inline"><label data-i18n="provider">Nhà cung cấp</label>：'
        + '<div style="width:150px;" class="layui-input-inline">'
        + '<select name="platform_id" lay-filter="rt_platform_id" lay-search>' + providerOptions + '</select></div></div>'
        + '<div class="layui-inline"><button type="button" class="layui-btn" lay-submit lay-filter="rt_doSearch"><i class="layui-icon layui-icon-search"></i> <span data-i18n="search">Tìm kiếm</span></button></div>'
        + '<div class="layui-inline"><button type="reset" class="layui-btn layui-btn-primary" id="rt_btnReset"><i class="layui-icon layui-icon-refresh"></i> <span data-i18n="reset">Đặt lại</span></button></div>'
        + '</form></div></fieldset></div>'
        + '<div class="layui-card-body"><table id="rt_dataTable" lay-filter="rt_dataTable"></table></div>'
        + '<div class="layui-fluid" style="margin-top:0;padding-top:0;padding-bottom:1px;"><div>'
        + '<span style="font-weight:bold;" data-i18n="summaryData">Dữ liệu tổng hợp:</span>'
        + '<table class="layui-table" lay-even lay-skin="nob"><thead><tr>'
        + '<th data-i18n="betAmount">Tiền cược</th><th data-i18n="turnover">Doanh thu</th>'
        + '<th data-i18n="prize">Trúng thưởng</th><th data-i18n="winLose">Thắng / Thua</th>'
        + '<th data-i18n="betTimesCol">Lượt cược</th><th data-i18n="bettersCountCol">Số người cược</th>'
        + '</tr></thead><tbody><tr>'
        + '<td id="rt_total_bet_amount" class="hs-text">0.0000</td>'
        + '<td id="rt_total_turnover" class="hs-text">0.0000</td>'
        + '<td id="rt_total_prize" class="hs-text">0.0000</td>'
        + '<td id="rt_total_win_lose" class="hs-text">0.0000</td>'
        + '<td id="rt_total_bet_times" class="hs-text">0</td>'
        + '<td id="rt_total_bet_number" class="hs-text">0</td>'
        + '</tr></tbody></table></div></div>'
        + '</div></div></div>';
    },

    init: function (container) {
      var table = layui.table;
      var form = layui.form;
      var laydate = layui.laydate;
      var $ = layui.$;

      var dates = HubUtils.getDateRanges();
      var defaultRange = dates.todayStr + ' | ' + dates.todayStr;

      // Setup quick date options with container-scoped IDs
      var map = {
        'rt_optToday': dates.todayStr + ' | ' + dates.todayStr,
        'rt_optYesterday': dates.yesterdayStr + ' | ' + dates.yesterdayStr,
        'rt_optWeek': dates.weekStartStr + ' | ' + dates.todayStr,
        'rt_optMonth': dates.monthStartStr + ' | ' + dates.todayStr,
        'rt_optLastMonth': dates.lastMonthStart + ' | ' + dates.lastMonthEnd
      };
      for (var id in map) {
        var el = container.querySelector('#' + id);
        if (el) el.value = map[id];
      }
      form.render('select');

      laydate.render({ elem: '#rt_dateRange', type: 'date', range: '|', rangeLinked: true, max: 0, value: defaultRange });

      form.on('select(rt_quickDateFilter)', function (data) {
        if (data.value) $('#rt_dateRange').val(data.value);
      });

      function renderTotalData(totalData) {
        if (!totalData) return;
        var fields = ['rt_total_bet_amount', 'rt_total_turnover', 'rt_total_prize', 'rt_total_win_lose', 'rt_total_bet_times', 'rt_total_bet_number'];
        fields.forEach(function (key) {
          var dataKey = key.replace('rt_', '');
          var val = totalData[dataKey];
          if (val === undefined || val === null) {
            val = (dataKey === 'total_bet_times' || dataKey === 'total_bet_number') ? '0' : '0.0000';
          }
          var el = container.querySelector('#' + key);
          if (el) el.textContent = val;
        });
      }

      table.render({
        elem: '#rt_dataTable',
        url: '/api/data/report-third',
        method: 'get',
        where: { date: defaultRange },
        toolbar: true,
        defaultToolbar: ['filter', 'print', 'exports'],
        page: true,
        limit: 10,
        text: { none: HubLang.t('noData') },
        parseData: function (res) {
          window._rt_totalData = res.total_data || null;
          return HubUtils.parseData(res);
        },
        request: { pageName: 'page', limitName: 'limit' },
        cols: [[
          { field: 'username', title: HubLang.t('account'), width: 130 },
          { field: 'platform_id_name', title: HubLang.t('provider'), width: 130 },
          { field: 't_bet_amount', title: HubLang.t('betAmount'), width: 140 },
          { field: 't_bet_times', title: HubLang.t('betTimes'), width: 100 },
          { field: 't_turnover', title: HubLang.t('turnover'), width: 140 },
          { field: 't_prize', title: HubLang.t('prize'), width: 140 },
          { field: 't_win_lose', title: HubLang.t('winLose'), width: 140 },
          { field: 'uid', title: 'UID', width: 90 },
          { field: 'platform_id', title: HubLang.t('providerId'), width: 80 }
        ]],
        done: function (res) {
          renderTotalData(window._rt_totalData);
        }
      });

      form.on('submit(rt_doSearch)', function (data) {
        table.reload('rt_dataTable', { where: data.field, page: { curr: 1 } });
        return false;
      });

      $(container).find('#rt_btnReset').on('click', function () {
        setTimeout(function () {
          $('#rt_dateRange').val(defaultRange);
          form.render('select');
          table.reload('rt_dataTable', {
            where: { date: defaultRange, username: '', platform_id: '' },
            page: { curr: 1 }
          });
        }, 50);
      });
    },

    destroy: function () {},
    onLangChange: function (container) {
      container.innerHTML = this.getHTML();
      HubLang.applyDOM(container);
      this.init(container);
    }
  };
})();
