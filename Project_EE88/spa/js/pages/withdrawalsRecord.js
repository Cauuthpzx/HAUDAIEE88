(function () {
  SpaPages.withdrawalsRecord = {

    getHTML: function () {
      var today = new Date();
      var todayStr = today.getFullYear() + '-'
        + String(today.getMonth() + 1).padStart(2, '0') + '-'
        + String(today.getDate()).padStart(2, '0');
      var defaultRange = todayStr + ' | ' + todayStr;

      return '<div class="layui-row">'
        + '<div class="layui-col-md12">'
        + '<div class="layui-card">'
        + '<div class="layui-form layui-card-header">'
        + '<fieldset class="layui-elem-field layui-field-title">'
        + '<legend data-i18n="withdrawHistoryTitle">' + HubLang.t('withdrawHistoryTitle') + '</legend>'
        + '<div class="layui-field-box">'
        + '<form class="layui-form" lay-filter="wr_searchForm">'

        // username
        + '<div class="layui-inline">'
        + '<label data-i18n="accountName">' + HubLang.t('accountName') + '</label>\uff1a'
        + '<div style="width:200px;" class="layui-input-inline">'
        + '<input type="text" name="username" placeholder="' + HubLang.t('enterAccountName') + '" class="layui-input" autocomplete="off">'
        + '</div></div>'

        // serial_no
        + '<div class="layui-inline">'
        + '<label data-i18n="serialNo">' + HubLang.t('serialNo') + '</label>\uff1a'
        + '<div style="width:200px;" class="layui-input-inline">'
        + '<input type="text" name="serial_no" placeholder="' + HubLang.t('enterSerialNo') + '" class="layui-input" autocomplete="off">'
        + '</div></div>'

        // date range
        + '<div class="layui-inline">'
        + '<label data-i18n="time">' + HubLang.t('time') + '</label>\uff1a'
        + '<div style="width:220px;" class="layui-input-inline">'
        + '<input type="text" name="create_time" id="wr_createTime" placeholder="' + HubLang.t('dateStartEnd') + '" class="layui-input" value="' + defaultRange + '" readonly autocomplete="off">'
        + '</div></div>'

        // status
        + '<div class="layui-inline">'
        + '<label data-i18n="status">' + HubLang.t('status') + '</label>\uff1a'
        + '<div class="layui-input-inline">'
        + '<select name="status" lay-filter="wr_status" lay-search>'
        + '<option value="" data-i18n="all">' + HubLang.t('all') + '</option>'
        + '<option value="0" data-i18n="statusPending">' + HubLang.t('statusPending') + '</option>'
        + '<option value="1" data-i18n="statusDone">' + HubLang.t('statusDone') + '</option>'
        + '<option value="2" data-i18n="statusProcessing">' + HubLang.t('statusProcessing') + '</option>'
        + '<option value="3" data-i18n="statusFailed">' + HubLang.t('statusFailed') + '</option>'
        + '</select>'
        + '</div></div>'

        // search button
        + '<div class="layui-inline">'
        + '<button type="button" class="layui-btn" lay-submit lay-filter="wr_doSearch">'
        + '<i class="layui-icon layui-icon-search"></i> '
        + '<span data-i18n="search">' + HubLang.t('search') + '</span>'
        + '</button></div>'

        // reset button
        + '<div class="layui-inline">'
        + '<button type="reset" class="layui-btn layui-btn-primary" id="wr_btnReset">'
        + '<i class="layui-icon layui-icon-refresh"></i> '
        + '<span data-i18n="reset">' + HubLang.t('reset') + '</span>'
        + '</button></div>'

        + '</form>'
        + '</div>'
        + '</fieldset>'
        + '</div>'

        + '<div class="layui-card-body">'
        + '<table id="wr_dataTable" lay-filter="wr_dataTable"></table>'
        + '</div>'

        + '</div>'
        + '</div>'
        + '</div>';
    },

    init: function (container) {
      var table = layui.table;
      var form = layui.form;
      var laydate = layui.laydate;

      var today = new Date();
      var todayStr = today.getFullYear() + '-'
        + String(today.getMonth() + 1).padStart(2, '0') + '-'
        + String(today.getDate()).padStart(2, '0');
      var defaultRange = todayStr + ' | ' + todayStr;

      form.render(null, 'wr_searchForm');

      laydate.render({
        elem: '#wr_createTime',
        type: 'date',
        range: '|',
        rangeLinked: true,
        value: defaultRange
      });

      table.render({
        elem: '#wr_dataTable',
        id: 'wr_dataTable',
        url: '/api/data/withdrawals',
        method: 'get',
        where: { create_time: defaultRange },
        toolbar: true,
        defaultToolbar: HubUtils.getDefaultToolbar(),
        page: true,
        limit: 10,
        text: { none: HubLang.t('noData') },
        parseData: HubUtils.parseData,
        request: { pageName: 'page', limitName: 'limit' },
        cols: [[
          { field: 'serial_no',         title: HubLang.t('serialNo'),        width: 220 },
          { field: 'username',          title: HubLang.t('account'),         width: 130 },
          { field: 'user_parent_format',title: HubLang.t('agent'),           width: 120 },
          { field: 'amount',            title: HubLang.t('amount'),          width: 130 },
          { field: 'true_amount',       title: HubLang.t('trueAmount'),      width: 130 },
          { field: 'name',              title: HubLang.t('accountHolder'),   width: 150 },
          { field: 'bank_id',           title: HubLang.t('bankId'),          width: 100 },
          { field: 'account',           title: HubLang.t('accountNo'),       width: 150 },
          { field: 'status_format',     title: HubLang.t('status'),          width: 110 },
          { field: 'operator',          title: HubLang.t('operator'),        width: 110 },
          { field: 'create_time',       title: HubLang.t('createTime'),      width: 160 },
          { field: 'success_time',      title: HubLang.t('successTime'),     width: 160 },
          { field: 'id',                title: 'ID',                         width: 100 },
          { field: 'uid',               title: 'UID',                        width:  90 },
          { field: 'user_parent',       title: HubLang.t('agentId'),         width: 100 },
          { field: 'user_tree',         title: HubLang.t('agentTree'),       width: 150 },
          { field: 'group_id',          title: HubLang.t('groupId'),         width:  80 },
          { field: 'firm_fee',          title: HubLang.t('firmFee'),         width: 120 },
          { field: 'user_fee',          title: HubLang.t('userFee'),         width: 120 },
          { field: 'rebate',            title: HubLang.t('rebate'),          width: 120 },
          { field: 'branch',            title: HubLang.t('branch'),          width: 130 },
          { field: 'transfer_time',     title: HubLang.t('transferTime'),    width: 160 },
          { field: 'remark',            title: HubLang.t('remark'),          width: 150 },
          { field: 'user_remark',       title: HubLang.t('userRemark'),      width: 150 },
          { field: 'prostatus',         title: HubLang.t('proStatus'),       width: 120 },
          { field: 'prize_amount',      title: HubLang.t('prizeAmount'),     width: 120 },
          { field: 'activity_id',       title: HubLang.t('activityId'),      width: 110 },
          { field: 'extra',             title: HubLang.t('extraInfo'),       width: 150 },
          { field: 'category_id',       title: HubLang.t('categoryId'),      width: 100 },
          { field: 'merchant_id',       title: HubLang.t('merchantId'),      width: 110 },
          { field: 'pay_type',          title: HubLang.t('payType'),         width: 120 },
          { field: 'trade_id',          title: HubLang.t('tradeId'),         width: 200 },
          { field: 'is_tester',         title: HubLang.t('isTester'),        width: 100 },
          { field: 'review_time',       title: HubLang.t('reviewTime'),      width: 160 },
          { field: 'transfer_record',   title: HubLang.t('transferRecord'),  width: 150 },
          { field: 'currency',          title: HubLang.t('currency'),        width:  80 },
          { field: 'update_time',       title: HubLang.t('updateTime'),      width: 160 }
        ]],
        done: function (res) {
          console.log('[withdrawalsRecord] loaded ' + (res.data ? res.data.length : 0) + '/' + res.count);
        }
      });

      table.on('toolbar(wr_dataTable)', function (obj) {
        if (obj.event === 'LAYTABLE_XLSX') {
          HubUtils.exportExcel('wr_dataTable', 'withdrawals');
        }
      });

      form.on('submit(wr_doSearch)', function (data) {
        table.reload('wr_dataTable', { where: data.field, page: { curr: 1 } });
        return false;
      });

      var btnReset = container.querySelector('#wr_btnReset');
      if (btnReset) {
        btnReset.addEventListener('click', function () {
          setTimeout(function () {
            form.render('select', 'wr_searchForm');
            var dtInput = container.querySelector('#wr_createTime');
            if (dtInput) dtInput.value = defaultRange;
            table.reload('wr_dataTable', {
              where: { username: '', serial_no: '', create_time: defaultRange, status: '' },
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
