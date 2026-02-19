(function () {
  // Lottery options
  var lotteryOpts =
    '<option value="" data-i18n="selectOrSearch">Chọn hoặc nhập để tìm kiếm</option>' +
    '<option value="67">Sicbo 30 giây</option><option value="66">Sicbo 20 giây</option>' +
    '<option value="68">Sicbo 40 giây</option><option value="69">Sicbo 50 giây</option>' +
    '<option value="70">Sicbo 1 phút</option><option value="71">Sicbo 1.5 phút</option>' +
    '<option value="73">Win go 45 giây</option><option value="74">Win go 1 phút</option>' +
    '<option value="75">Win go 3 phút</option><option value="76">Win go 5 phút</option>' +
    '<option value="77">Win go 30 giây</option>' +
    '<option value="51">Keno VIP 20 giây</option><option value="52">Keno VIP 30 giây</option>' +
    '<option value="53">Keno VIP 40 giây</option><option value="54">Keno VIP 50 giây</option>' +
    '<option value="55">Keno VIP 1 phút</option><option value="56">Keno VIP 5 phút</option>' +
    '<option value="32">Miền Bắc</option><option value="63">Xổ số Miền Bắc</option>' +
    '<option value="46">M.bắc nhanh 3 phút</option><option value="45">M.bắc nhanh 5 phút</option>' +
    '<option value="47">Miền Bắc VIP 45 giây</option><option value="48">Miền Bắc VIP 75 giây</option>' +
    '<option value="49">Miền Bắc VIP 2 phút</option><option value="44">Miền Nam VIP 5 phút</option>' +
    '<option value="57">Miền Nam VIP 45 giây</option><option value="58">Miền Nam VIP 1 phút</option>' +
    '<option value="59">Miền Nam VIP 90 giây</option><option value="60">Miền Nam VIP 2 phút</option>' +
    '<option value="1">Bạc Liêu</option><option value="2">Vũng Tàu</option>' +
    '<option value="3">Tiền Giang</option><option value="4">Kiên Giang</option>' +
    '<option value="5">Đà Lạt</option><option value="6">Bình Phước</option>' +
    '<option value="7">Bình Dương</option><option value="8">An Giang</option>' +
    '<option value="9">Bình Thuận</option><option value="10">Cà Mau</option>' +
    '<option value="11">Cần Thơ</option><option value="12">Hậu Giang</option>' +
    '<option value="13">Đồng Tháp</option><option value="14">Tây Ninh</option>' +
    '<option value="15">Sóc Trăng</option><option value="16">TP Hồ Chí Minh</option>' +
    '<option value="17">Đồng Nai</option><option value="30">Đắk Lắk</option>' +
    '<option value="31">Đắk Nông</option><option value="42">Trà Vinh</option>' +
    '<option value="43">Vĩnh Long</option><option value="18">Đà Nẵng</option>' +
    '<option value="19">Thừa Thiên Huế</option><option value="20">Quảng Trị</option>' +
    '<option value="21">Phú Yên</option><option value="22">Quảng Bình</option>' +
    '<option value="23">Quảng Nam</option><option value="24">Quảng Ngãi</option>' +
    '<option value="25">Ninh Thuận</option><option value="26">Kon Tum</option>' +
    '<option value="27">Khánh Hoà</option><option value="28">Gia Lai</option>' +
    '<option value="29">Bình Định</option>';

  SpaPages.reportLottery = {
    getHTML: function () {
      return (
        '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">' +
        '<div class="layui-form layui-card-header"><fieldset class="layui-elem-field">' +
        '<legend data-i18n="reportLotteryTitle">Báo cáo xổ số</legend>' +
        '<div class="layui-field-box"><form class="layui-form" lay-filter="rl_searchForm">' +
        '<div class="layui-inline"><label data-i18n="time">Thời gian</label>：' +
        '<div style="width:220px;" class="layui-input-inline">' +
        '<input type="text" name="date" id="rl_dateRange" placeholder="' +
        HubLang.t('dateStartEnd') +
        '" class="layui-input" readonly autocomplete="off"></div></div>' +
        '<div class="layui-inline"><div style="width:100px;" class="layui-input-inline">' +
        '<select lay-filter="rl_quickDateFilter" lay-search="">' +
        '<option value="" id="rl_optToday" data-i18n="today">Hôm nay</option>' +
        '<option value="" id="rl_optYesterday" data-i18n="yesterday">Hôm qua</option>' +
        '<option value="" id="rl_optWeek" data-i18n="thisWeek">Tuần này</option>' +
        '<option value="" id="rl_optMonth" data-i18n="thisMonth">Tháng này</option>' +
        '<option value="" id="rl_optLastMonth" data-i18n="lastMonth">Tháng trước</option>' +
        '</select></div></div>' +
        '<div class="layui-inline"><label data-i18n="lotteryType">Tên loại xổ</label>：' +
        '<div style="width:200px;" class="layui-input-inline">' +
        '<select name="lottery_id" lay-search="">' +
        lotteryOpts +
        '</select></div></div>' +
        '<div class="layui-inline"><label data-i18n="accountName">Tên tài khoản</label>：' +
        '<div style="width:200px;" class="layui-input-inline">' +
        '<input type="text" name="username" placeholder="' +
        HubLang.t('enterAccountName') +
        '" class="layui-input" autocomplete="off"></div></div>' +
        '<div class="layui-inline"><button type="button" class="layui-btn" lay-submit lay-filter="rl_doSearch"><i class="hi hi-magnifying-glass"></i> <span data-i18n="search">Tìm kiếm</span></button></div>' +
        '<div class="layui-inline"><button type="reset" class="layui-btn layui-btn-primary" id="rl_btnReset"><i class="hi hi-arrows-rotate"></i> <span data-i18n="reset">Đặt lại</span></button></div>' +
        '</form></div></fieldset></div>' +
        '<div class="layui-card-body"><table id="rl_dataTable" lay-filter="rl_dataTable"></table></div>' +
        '<div class="layui-fluid" style="margin-top:0;padding-top:0;padding-bottom:1px;"><div>' +
        '<span style="font-weight:bold;" data-i18n="summaryData">Dữ liệu tổng hợp:</span>' +
        '<table class="layui-table" lay-even lay-skin="nob"><thead><tr>' +
        '<th data-i18n="bettersCount">Số khách đặt cược</th><th data-i18n="betCount">Số lần cược</th>' +
        '<th data-i18n="betAmount">Tiền cược</th><th data-i18n="validBetAmount">Tiền cược hợp lệ (trừ cược hoà)</th>' +
        '<th data-i18n="rebateAmount">Hoàn trả</th><th data-i18n="winLose">Thắng thua</th>' +
        '<th data-i18n="winLoseNoRebate">Kết quả thắng thua (không gồm hoàn trả)</th>' +
        '<th data-i18n="prizeCol">Tiền trúng</th>' +
        '</tr></thead><tbody><tr>' +
        '<td id="rl_total_bet_number" class="hs-text">0</td>' +
        '<td id="rl_total_bet_count" class="hs-text">0</td>' +
        '<td id="rl_total_bet_amount" class="hs-text">0.0000</td>' +
        '<td id="rl_total_valid_amount" class="hs-text">0.0000</td>' +
        '<td id="rl_total_rebate_amount" class="hs-text">0.0000</td>' +
        '<td id="rl_total_result" class="hs-text">0.0000</td>' +
        '<td id="rl_total_win_lose" class="hs-text">0.0000</td>' +
        '<td id="rl_total_prize" class="hs-text">0.0000</td>' +
        '</tr></tbody></table></div></div>' +
        '</div></div></div>'
      );
    },

    init: function (container) {
      var table = layui.table;
      var form = layui.form;
      var laydate = layui.laydate;
      var $ = layui.$;

      var dates = HubUtils.getDateRanges();

      var map = {
        rl_optToday: dates.todayStr + ' | ' + dates.todayStr,
        rl_optYesterday: dates.yesterdayStr + ' | ' + dates.yesterdayStr,
        rl_optWeek: dates.weekStartStr + ' | ' + dates.todayStr,
        rl_optMonth: dates.monthStartStr + ' | ' + dates.todayStr,
        rl_optLastMonth: dates.lastMonthStart + ' | ' + dates.lastMonthEnd
      };
      for (var id in map) {
        var el = container.querySelector('#' + id);
        if (el) el.value = map[id];
      }
      form.render('select');

      laydate.render({
        elem: '#rl_dateRange',
        type: 'date',
        range: '|',
        rangeLinked: true,
        max: 0
      });

      form.on('select(rl_quickDateFilter)', function (data) {
        if (data.value) $('#rl_dateRange').val(data.value);
      });

      function renderTotalData(totalData) {
        if (!totalData) return;
        var fields = [
          'rl_total_bet_number',
          'rl_total_bet_count',
          'rl_total_bet_amount',
          'rl_total_valid_amount',
          'rl_total_rebate_amount',
          'rl_total_result',
          'rl_total_win_lose',
          'rl_total_prize'
        ];
        fields.forEach(function (key) {
          var dataKey = key.replace('rl_', '');
          var val = totalData[dataKey];
          if (val === undefined || val === null) {
            val =
              dataKey === 'total_bet_count' || dataKey === 'total_bet_number'
                ? '0'
                : '0.0000';
          }
          var el = container.querySelector('#' + key);
          if (el) el.textContent = val;
        });
      }

      table.render({
        elem: '#rl_dataTable',
        id: 'rl_dataTable',
        url: '/api/data/report-lottery',
        method: 'get',
        where: {},
        toolbar: true,
        defaultToolbar: HubUtils.getDefaultToolbar(),
        page: true,
        limit: 10,
        text: { none: HubLang.t('noData') },
        parseData: function (res) {
          window._rl_totalData = res.total_data || null;
          return HubUtils.parseData(res);
        },
        request: { pageName: 'page', limitName: 'limit' },
        cols: [
          [
            { field: 'username', title: HubLang.t('account'), minWidth: 130 },
            {
              field: 'user_parent_format',
              title: HubLang.t('agent'),
              minWidth: 120
            },
            {
              field: 'lottery_name',
              title: HubLang.t('lotteryName'),
              minWidth: 200
            },
            { field: 'bet_count', title: HubLang.t('betTimes'), minWidth: 100 },
            {
              field: 'bet_amount',
              title: HubLang.t('betAmount'),
              minWidth: 140
            },
            {
              field: 'valid_amount',
              title: HubLang.t('validAmount'),
              minWidth: 140
            },
            {
              field: 'rebate_amount',
              title: HubLang.t('rebateAmount'),
              minWidth: 120
            },
            { field: 'prize', title: HubLang.t('prize'), minWidth: 140 },
            { field: 'result', title: HubLang.t('result'), minWidth: 140 },
            { field: 'win_lose', title: HubLang.t('winLose'), minWidth: 140 },
            { field: 'uid', title: 'UID', width: 90 },
            { field: 'lottery_id', title: HubLang.t('lotteryId'), width: 90 }
          ]
        ],
        done: function (res) {
          renderTotalData(window._rl_totalData);
        }
      });

      table.on('toolbar(rl_dataTable)', function (obj) {
        if (obj.event === 'LAYTABLE_XLSX') {
          HubUtils.exportExcel('rl_dataTable', 'report_lottery');
        }
      });

      form.on('submit(rl_doSearch)', function (data) {
        table.reload('rl_dataTable', { where: data.field, page: { curr: 1 } });
        return false;
      });

      $(container)
        .find('#rl_btnReset')
        .on('click', function () {
          setTimeout(function () {
            $('#rl_dateRange').val('');
            form.render('select');
            table.reload('rl_dataTable', {
              where: { date: '', username: '', lottery_id: '' },
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
