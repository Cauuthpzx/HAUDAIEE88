(function () {
  SpaPages.betOrder = {
    getHTML: function () {
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-form layui-card-header">'
        + '<fieldset class="layui-elem-field">'
        + '<legend data-i18n="thirdPartyBetTitle">Đơn cược bên thứ 3</legend>'
        + '<div class="layui-field-box">'
        + '<form class="layui-form" lay-filter="betOrder_searchForm">'
        + '<div class="layui-inline">'
        + '<label data-i18n="betTimeLabel">Thời gian cược</label>：'
        + '<div style="width:220px;" class="layui-input-inline">'
        + '<input type="text" name="bet_time" id="betOrder_betTime"'
        + ' placeholder="' + HubLang.t('dateStartEnd') + '"'
        + ' class="layui-input" readonly autocomplete="off">'
        + '</div></div>'
        + '<div class="layui-inline">'
        + '<label data-i18n="serialNo">Mã giao dịch</label>：'
        + '<div style="width:200px;" class="layui-input-inline">'
        + '<input type="text" name="serial_no"'
        + ' placeholder="' + HubLang.t('enterSerialNo') + '"'
        + ' class="layui-input" autocomplete="off">'
        + '</div></div>'
        + '<div class="layui-inline">'
        + '<label data-i18n="platformAccount">Tài khoản platform</label>：'
        + '<div style="width:200px;" class="layui-input-inline">'
        + '<input type="text" name="platform_username"'
        + ' placeholder="' + HubLang.t('enterPlatformAccount') + '"'
        + ' class="layui-input" autocomplete="off">'
        + '</div></div>'
        + '<div class="layui-inline">'
        + '<button type="button" class="layui-btn" lay-submit lay-filter="betOrder_doSearch">'
        + '<i class="layui-icon layui-icon-search"></i> <span data-i18n="search">Tìm kiếm</span>'
        + '</button></div>'
        + '<div class="layui-inline">'
        + '<button type="reset" class="layui-btn layui-btn-primary" id="betOrder_btnReset">'
        + '<i class="layui-icon layui-icon-refresh"></i> <span data-i18n="reset">Đặt lại</span>'
        + '</button></div>'
        + '</form></div>'
        + '</fieldset></div>'
        + '<div class="layui-card-body">'
        + '<table id="betOrder_dataTable" lay-filter="betOrder_dataTable"></table>'
        + '</div>'
        + '</div></div></div>';
    },

    init: function (container) {
      var table = layui.table;
      var form = layui.form;
      var laydate = layui.laydate;

      var dates = HubUtils.getDateRanges();
      var defaultRange = dates.todayStr + ' | ' + dates.todayStr;

      laydate.render({
        elem: '#betOrder_betTime',
        type: 'date',
        range: '|',
        rangeLinked: true,
        value: defaultRange
      });

      form.render(null, 'betOrder_searchForm');

      table.render({
        elem: '#betOrder_dataTable',
        id: 'betOrder_dataTable',
        url: '/api/data/bet-orders',
        method: 'get',
        where: { bet_time: defaultRange },
        toolbar: true,
        defaultToolbar: ['filter', 'print', 'exports'],
        page: true,
        limit: 10,
        text: { none: HubLang.t('noData') },
        parseData: HubUtils.parseData,
        request: { pageName: 'page', limitName: 'limit' },
        cols: [[
          { field: 'serial_no', title: HubLang.t('serialNo'), width: 220 },
          { field: 'platform_id_name', title: HubLang.t('provider'), width: 120 },
          { field: 'c_name', title: HubLang.t('gameCategory'), width: 120 },
          { field: 'game_name', title: HubLang.t('gameName'), width: 180 },
          { field: 'bet_amount', title: HubLang.t('betAmount'), width: 130 },
          { field: 'turnover', title: HubLang.t('turnover'), width: 130 },
          { field: 'prize', title: HubLang.t('prize'), width: 130 },
          { field: 'win_lose', title: HubLang.t('winLose'), width: 130 },
          { field: 'bet_time', title: HubLang.t('betTime'), width: 160 },
          { field: 'platform_username', title: HubLang.t('tkPlatform'), width: 150 },
          { field: 'id', title: 'ID', width: 120 },
          { field: 'uid', title: 'UID', width: 90 },
          { field: 'platform_id', title: HubLang.t('providerId'), width: 80 },
          { field: 'cid', title: HubLang.t('categoryTypeId'), width: 80 }
        ]],
        done: function (res) {
          console.log('[betOrder] Đã tải ' + (res.data ? res.data.length : 0) + '/' + res.count + ' đơn cược');
        }
      });

      form.on('submit(betOrder_doSearch)', function (data) {
        table.reload('betOrder_dataTable', { where: data.field, page: { curr: 1 } });
        return false;
      });

      var btnReset = container.querySelector('#betOrder_btnReset');
      if (btnReset) {
        btnReset.addEventListener('click', function () {
          setTimeout(function () {
            form.render('select', 'betOrder_searchForm');
            var betTimeEl = container.querySelector('#betOrder_betTime');
            if (betTimeEl) betTimeEl.value = defaultRange;
            table.reload('betOrder_dataTable', {
              where: { bet_time: defaultRange, serial_no: '', platform_username: '' },
              page: { curr: 1 }
            });
          }, 50);
        });
      }
    },

    destroy: function () {},

    onLangChange: function (container) {
      container.innerHTML = this.getHTML();
      HubLang.applyDOM(container);
      this.init(container);
    }
  };
})();
