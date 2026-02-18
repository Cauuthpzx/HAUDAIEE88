(function () {
  SpaPages.reportFunds = {
    getHTML: function () {
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-form layui-card-header"><fieldset class="layui-elem-field">'
        + '<legend data-i18n="transStatementTitle">Sao kê giao dịch</legend>'
        + '<div class="layui-field-box"><form class="layui-form" lay-filter="rf_searchForm">'
        + '<div class="layui-inline"><label data-i18n="time">Thời gian</label>：'
        + '<div style="width:220px;" class="layui-input-inline">'
        + '<input type="text" name="date" id="rf_dateRange" placeholder="' + HubLang.t('dateStartEnd') + '" class="layui-input" readonly autocomplete="off"></div></div>'
        + '<div class="layui-inline"><div style="width:100px;" class="layui-input-inline">'
        + '<select lay-filter="rf_quickDateFilter" lay-search="">'
        + '<option value="" id="rf_optToday" data-i18n="today">Hôm nay</option>'
        + '<option value="" id="rf_optYesterday" data-i18n="yesterday">Hôm qua</option>'
        + '<option value="" id="rf_optWeek" data-i18n="thisWeek">Tuần này</option>'
        + '<option value="" id="rf_optMonth" data-i18n="thisMonth">Tháng này</option>'
        + '<option value="" id="rf_optLastMonth" data-i18n="lastMonth">Tháng trước</option>'
        + '</select></div></div>'
        + '<div class="layui-inline"><label data-i18n="accountName">Tên tài khoản</label>：'
        + '<div style="width:200px;" class="layui-input-inline">'
        + '<input type="text" name="username" placeholder="' + HubLang.t('enterAccountName') + '" class="layui-input" autocomplete="off"></div></div>'
        + '<div class="layui-inline"><button type="button" class="layui-btn" lay-submit lay-filter="rf_doSearch"><i class="hi hi-magnifying-glass"></i> <span data-i18n="search">Tìm kiếm</span></button></div>'
        + '<div class="layui-inline"><button type="reset" class="layui-btn layui-btn-primary" id="rf_btnReset"><i class="hi hi-arrows-rotate"></i> <span data-i18n="reset">Đặt lại</span></button></div>'
        + '</form></div></fieldset></div>'
        + '<div class="layui-card-body"><table id="rf_dataTable" lay-filter="rf_dataTable"></table></div>'
        + '<div class="layui-fluid" style="margin-top:0;padding-top:0;padding-bottom:1px;"><div>'
        + '<span style="font-weight:bold;" data-i18n="summaryData">Dữ liệu tổng hợp:</span>'
        + '<table class="layui-table" lay-even lay-skin="nob"><thead><tr>'
        + '<th data-i18n="depositAmountTotal">Số tiền nạp</th><th data-i18n="withdrawAmountTotal">Số tiền rút</th>'
        + '<th data-i18n="chargeFee">Phí dịch vụ</th><th data-i18n="agentCommission">Hoa hồng đại lý</th>'
        + '<th data-i18n="promotion">Ưu đãi</th><th data-i18n="thirdRebate">Hoàn trả bên thứ 3</th>'
        + '<th data-i18n="thirdActivityAmount">Tiền thưởng từ bên thứ 3</th>'
        + '</tr></thead><tbody><tr>'
        + '<td id="rf_total_deposit_amount" class="hs-text">0.0000</td>'
        + '<td id="rf_total_withdrawal_amount" class="hs-text">0.0000</td>'
        + '<td id="rf_total_charge_fee" class="hs-text">0.0000</td>'
        + '<td id="rf_total_agent_commission" class="hs-text">0.0000</td>'
        + '<td id="rf_total_promotion" class="hs-text">0.0000</td>'
        + '<td id="rf_total_third_rebate" class="hs-text">0.0000</td>'
        + '<td id="rf_total_third_activity_amount" class="hs-text">0.0000</td>'
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

      var map = {
        'rf_optToday': dates.todayStr + ' | ' + dates.todayStr,
        'rf_optYesterday': dates.yesterdayStr + ' | ' + dates.yesterdayStr,
        'rf_optWeek': dates.weekStartStr + ' | ' + dates.todayStr,
        'rf_optMonth': dates.monthStartStr + ' | ' + dates.todayStr,
        'rf_optLastMonth': dates.lastMonthStart + ' | ' + dates.lastMonthEnd
      };
      for (var id in map) {
        var el = container.querySelector('#' + id);
        if (el) el.value = map[id];
      }
      form.render('select');

      laydate.render({ elem: '#rf_dateRange', type: 'date', range: '|', rangeLinked: true, max: 0, value: defaultRange });

      form.on('select(rf_quickDateFilter)', function (data) {
        if (data.value) $('#rf_dateRange').val(data.value);
      });

      function renderTotalData(totalData) {
        if (!totalData) return;
        var fields = ['rf_total_deposit_amount', 'rf_total_withdrawal_amount', 'rf_total_charge_fee', 'rf_total_agent_commission', 'rf_total_promotion', 'rf_total_third_rebate', 'rf_total_third_activity_amount'];
        fields.forEach(function (key) {
          var dataKey = key.replace('rf_', '');
          var val = totalData[dataKey];
          if (val === undefined || val === null) val = '0.0000';
          var el = container.querySelector('#' + key);
          if (el) el.textContent = val;
        });
      }

      table.render({
        elem: '#rf_dataTable',
        id: 'rf_dataTable',
        url: '/api/data/report-funds',
        method: 'get',
        where: { date: defaultRange },
        toolbar: true,
        defaultToolbar: HubUtils.getDefaultToolbar(),
        page: true,
        limit: 10,
        text: { none: HubLang.t('noData') },
        parseData: function (res) {
          window._rf_totalData = res.total_data || null;
          return HubUtils.parseData(res);
        },
        request: { pageName: 'page', limitName: 'limit' },
        cols: [[
          { field: 'username', title: HubLang.t('account'), width: 150, fixed: 'left' },
          { field: 'user_parent_format', title: HubLang.t('agent'), minWidth: 150 },
          { field: 'deposit_count', title: HubLang.t('depositCountCol'), minWidth: 160 },
          { field: 'deposit_amount', title: HubLang.t('depositAmountTotal'), minWidth: 150, sort: true },
          { field: 'withdrawal_count', title: HubLang.t('withdrawCountCol'), minWidth: 150 },
          { field: 'withdrawal_amount', title: HubLang.t('withdrawAmountTotal'), minWidth: 160 },
          { field: 'charge_fee', title: HubLang.t('chargeFee'), minWidth: 150 },
          { field: 'agent_commission', title: HubLang.t('agentCommission'), minWidth: 150 },
          { field: 'promotion', title: HubLang.t('promotion'), minWidth: 150 },
          { field: 'third_rebate', title: HubLang.t('thirdRebate'), minWidth: 150 },
          { field: 'third_activity_amount', title: HubLang.t('thirdActivityAmount'), minWidth: 150 },
          { field: 'date', title: HubLang.t('dateCol'), minWidth: 160, fixed: 'right' },
          { field: 'id', title: 'ID', width: 100 },
          { field: 'uid', title: 'UID', width: 90 },
          { field: 'user_parent', title: HubLang.t('agentId'), width: 100 }
        ]],
        done: function (res) {
          renderTotalData(window._rf_totalData);
        }
      });

      table.on('toolbar(rf_dataTable)', function (obj) {
        if (obj.event === 'LAYTABLE_XLSX') {
          HubUtils.exportExcel('rf_dataTable', 'report_funds');
        }
      });

      form.on('submit(rf_doSearch)', function (data) {
        table.reload('rf_dataTable', { where: data.field, page: { curr: 1 } });
        return false;
      });

      $(container).find('#rf_btnReset').on('click', function () {
        setTimeout(function () {
          $('#rf_dateRange').val(defaultRange);
          form.render('select');
          table.reload('rf_dataTable', {
            where: { date: defaultRange, username: '' },
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
