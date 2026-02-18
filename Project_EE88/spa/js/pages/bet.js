(function () {
  // ── Lottery options (same as reportLottery) ──
  var lotteryOpts = '<option value="">' + HubLang.t('select') + '</option>'
    + '<option value="67">Sicbo 30 gi\u00e2y</option>'
    + '<option value="66">Sicbo 20 gi\u00e2y</option>'
    + '<option value="68">Sicbo 40 gi\u00e2y</option>'
    + '<option value="69">Sicbo 50 gi\u00e2y</option>'
    + '<option value="70">Sicbo 1 ph\u00fat</option>'
    + '<option value="71">Sicbo 1.5 ph\u00fat</option>'
    + '<option value="73">Win go 45 gi\u00e2y</option>'
    + '<option value="74">Win go 1 ph\u00fat</option>'
    + '<option value="75">Win go 3 ph\u00fat</option>'
    + '<option value="76">Win go 5 ph\u00fat</option>'
    + '<option value="77">Win go 30 gi\u00e2y</option>'
    + '<option value="51">Keno VIP 20 gi\u00e2y</option>'
    + '<option value="52">Keno VIP 30 gi\u00e2y</option>'
    + '<option value="53">Keno VIP 40 gi\u00e2y</option>'
    + '<option value="54">Keno VIP 50 gi\u00e2y</option>'
    + '<option value="55">Keno VIP 1 ph\u00fat</option>'
    + '<option value="56">Keno VIP 5 ph\u00fat</option>'
    + '<option value="32">Mi\u1ec1n B\u1eafc</option>'
    + '<option value="63">X\u1ed5 s\u1ed1 Mi\u1ec1n B\u1eafc</option>'
    + '<option value="46">M.b\u1eafc nhanh 3 ph\u00fat</option>'
    + '<option value="45">M.b\u1eafc nhanh 5 ph\u00fat</option>'
    + '<option value="47">Mi\u1ec1n B\u1eafc VIP 45 gi\u00e2y</option>'
    + '<option value="48">Mi\u1ec1n B\u1eafc VIP 75 gi\u00e2y</option>'
    + '<option value="49">Mi\u1ec1n B\u1eafc VIP 2 ph\u00fat</option>'
    + '<option value="44">Mi\u1ec1n Nam VIP 5 ph\u00fat</option>'
    + '<option value="57">Mi\u1ec1n Nam VIP 45 gi\u00e2y</option>'
    + '<option value="58">Mi\u1ec1n Nam VIP 1 ph\u00fat</option>'
    + '<option value="59">Mi\u1ec1n Nam VIP 90 gi\u00e2y</option>'
    + '<option value="60">Mi\u1ec1n Nam VIP 2 ph\u00fat</option>'
    + '<option value="1">B\u1ea1c Li\u00eau</option>'
    + '<option value="2">V\u0169ng T\u00e0u</option>'
    + '<option value="3">Ti\u1ec1n Giang</option>'
    + '<option value="4">Ki\u00ean Giang</option>'
    + '<option value="5">\u0110\u00e0 L\u1ea1t</option>'
    + '<option value="6">B\u00ecnh Ph\u01b0\u1edbc</option>'
    + '<option value="7">B\u00ecnh D\u01b0\u01a1ng</option>'
    + '<option value="8">An Giang</option>'
    + '<option value="9">B\u00ecnh Thu\u1eadn</option>'
    + '<option value="10">C\u00e0 Mau</option>'
    + '<option value="11">C\u1ea7n Th\u01a1</option>'
    + '<option value="12">H\u1eadu Giang</option>'
    + '<option value="13">\u0110\u1ed3ng Th\u00e1p</option>'
    + '<option value="14">T\u00e2y Ninh</option>'
    + '<option value="15">S\u00f3c Tr\u0103ng</option>'
    + '<option value="16">TP H\u1ed3 Ch\u00ed Minh</option>'
    + '<option value="17">\u0110\u1ed3ng Nai</option>'
    + '<option value="30">\u0110\u1eafk L\u1eadk</option>'
    + '<option value="31">\u0110\u1eafk N\u00f4ng</option>'
    + '<option value="42">Tr\u00e0 Vinh</option>'
    + '<option value="43">V\u0129nh Long</option>'
    + '<option value="18">\u0110\u00e0 N\u1eb5ng</option>'
    + '<option value="19">Th\u1eeba Thi\u00ean Hu\u1ebf</option>'
    + '<option value="20">Qu\u1ea3ng Tr\u1ecb</option>'
    + '<option value="21">Ph\u00fa Y\u00ean</option>'
    + '<option value="22">Qu\u1ea3ng B\u00ecnh</option>'
    + '<option value="23">Qu\u1ea3ng Nam</option>'
    + '<option value="24">Qu\u1ea3ng Ng\u00e3i</option>'
    + '<option value="25">Ninh Thu\u1eadn</option>'
    + '<option value="26">Kon Tum</option>'
    + '<option value="27">Kh\u00e1nh Ho\u00e0</option>'
    + '<option value="28">Gia Lai</option>'
    + '<option value="29">B\u00ecnh \u0110\u1ecbnh</option>';

  SpaPages.bet = {
    getHTML: function () {
      var t = HubLang.t.bind(HubLang);
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-form layui-card-header">'
        + '<fieldset class="layui-elem-field layui-field-title">'
        + '<legend data-i18n="betListTitle">' + t('betListTitle') + '</legend>'
        + '<div class="layui-field-box">'
        + '<form class="layui-form" lay-filter="bet_searchForm">'

        // Date range input
        + '<div class="layui-inline">'
        + '<div style="width:220px;" class="layui-input-inline">'
        + '<input type="text" name="create_time" id="bet_hsDateTime"'
        + ' placeholder="' + t('dateStartEnd') + '"'
        + ' class="layui-input" readonly autocomplete="off">'
        + '</div></div>'

        // Quick date select
        + '<div class="layui-inline">'
        + '<div style="width:100px;" class="layui-input-inline">'
        + '<select lay-filter="bet_quickDateFilter" lay-search="">'
        + '<option value="" id="bet_optToday" data-i18n="today">' + t('today') + '</option>'
        + '<option value="" id="bet_optYesterday" data-i18n="yesterday">' + t('yesterday') + '</option>'
        + '</select>'
        + '</div></div>'

        // Username input
        + '<div class="layui-inline">'
        + '<label data-i18n="userName">' + t('userName') + '</label>\uff1a'
        + '<div style="width:160px;" class="layui-input-inline">'
        + '<input type="text" name="username"'
        + ' placeholder="' + t('enterFullUsername') + '"'
        + ' data-i18n="enterFullUsername" data-i18n-attr="placeholder"'
        + ' class="layui-input" autocomplete="off">'
        + '</div></div>'

        // Serial no input
        + '<div class="layui-inline">'
        + '<label data-i18n="serialNo">' + t('serialNo') + '</label>\uff1a'
        + '<div class="layui-input-inline">'
        + '<input type="text" name="serial_no"'
        + ' placeholder="' + t('enterFullSerialNo') + '"'
        + ' data-i18n="enterFullSerialNo" data-i18n-attr="placeholder"'
        + ' class="layui-input" autocomplete="off">'
        + '</div></div>'

        // Lottery select
        + '<div class="layui-inline">'
        + '<label data-i18n="game">' + t('game') + '</label>\uff1a'
        + '<div style="width:150px;" class="layui-input-inline">'
        + '<select name="lottery_id" lay-filter="bet_lotteryFilter" lay-search="">'
        + lotteryOpts
        + '</select>'
        + '</div></div>'

        // Play type select (cascading)
        + '<div class="layui-inline">'
        + '<label data-i18n="gameType">' + t('gameType') + '</label>\uff1a'
        + '<div style="width:180px;" class="layui-input-inline">'
        + '<select name="play_type_id" id="bet_playTypeSelect" lay-filter="bet_playTypeFilter" lay-search="">'
        + '<option value="">' + t('select') + '</option>'
        + '</select>'
        + '</div></div>'

        // Play select (cascading)
        + '<div class="layui-inline">'
        + '<label data-i18n="playStyle">' + t('playStyle') + '</label>\uff1a'
        + '<div style="width:180px;" class="layui-input-inline">'
        + '<select name="play_id" id="bet_playSelect" lay-search="">'
        + '<option value="">' + t('select') + '</option>'
        + '</select>'
        + '</div></div>'

        // Status select
        + '<div class="layui-inline">'
        + '<label data-i18n="status">' + t('status') + '</label>\uff1a'
        + '<div style="width:100px;" class="layui-input-inline">'
        + '<select name="status" lay-search="">'
        + '<option value="">' + t('select') + '</option>'
        + '<option value="-9" data-i18n="betStatusUnpaid">' + t('betStatusUnpaid') + '</option>'
        + '<option value="1" data-i18n="betStatusWon">' + t('betStatusWon') + '</option>'
        + '<option value="-1" data-i18n="betStatusLost">' + t('betStatusLost') + '</option>'
        + '<option value="2" data-i18n="betStatusDraw">' + t('betStatusDraw') + '</option>'
        + '<option value="3" data-i18n="betStatusCancelUser">' + t('betStatusCancelUser') + '</option>'
        + '<option value="4" data-i18n="betStatusCancelSystem">' + t('betStatusCancelSystem') + '</option>'
        + '<option value="5" data-i18n="betStatusAbnormal">' + t('betStatusAbnormal') + '</option>'
        + '<option value="6" data-i18n="betStatusUnpaidManual">' + t('betStatusUnpaidManual') + '</option>'
        + '</select>'
        + '</div></div>'

        // Search button
        + '<div class="layui-inline">'
        + '<button type="button" class="layui-btn" lay-submit lay-filter="bet_doSearch">'
        + '<i class="hi hi-magnifying-glass"></i>'
        + ' <span data-i18n="search">' + t('search') + '</span>'
        + '</button></div>'

        // Reset button
        + '<div class="layui-inline">'
        + '<button type="reset" class="layui-btn layui-btn-primary" id="bet_btnReset">'
        + '<i class="hi hi-arrows-rotate"></i>'
        + ' <span data-i18n="reset">' + t('reset') + '</span>'
        + '</button></div>'

        + '</form></div>'
        + '</fieldset></div>'

        // Table
        + '<div class="layui-card-body">'
        + '<table id="bet_dataTable" lay-filter="bet_dataTable"></table>'
        + '</div>'

        // Summary section
        + '<div class="layui-fluid" id="bet_totalSection"'
        + ' style="margin-top:0;padding-top:0;padding-bottom:1px;">'
        + '<div>'
        + '<span style="font-weight:bold;" data-i18n="summaryData">' + t('summaryData') + '</span>'
        + '<table class="layui-table" lay-even lay-skin="nob">'
        + '<thead><tr>'
        + '<th data-i18n="totalBetMoney">' + t('totalBetMoney') + '</th>'
        + '<th data-i18n="totalRebateAmount">' + t('totalRebateAmount') + '</th>'
        + '<th data-i18n="totalWinLose">' + t('totalWinLose') + '</th>'
        + '</tr></thead>'
        + '<tbody><tr>'
        + '<td id="bet_total_money" class="hs-text">0.0000</td>'
        + '<td id="bet_total_rebate_amount" class="hs-text">0.0000</td>'
        + '<td id="bet_total_result" class="hs-text">0.0000</td>'
        + '</tr></tbody>'
        + '</table>'
        + '</div></div>'

        + '</div></div></div>';
    },

    init: function (container) {
      var table = layui.table;
      var form = layui.form;
      var laydate = layui.laydate;
      var $ = layui.$;

      var dates = HubUtils.getDateRanges();
      var defaultRange = dates.todayStr + ' | ' + dates.todayStr;

      // Set quick date option values
      var todayEl = container.querySelector('#bet_optToday');
      if (todayEl) todayEl.value = dates.todayStr + ' | ' + dates.todayStr;
      var yesEl = container.querySelector('#bet_optYesterday');
      if (yesEl) yesEl.value = dates.yesterdayStr + ' | ' + dates.yesterdayStr;
      form.render('select');

      // Date range picker
      laydate.render({
        elem: '#bet_hsDateTime',
        type: 'date',
        range: '|',
        rangeLinked: true,
        max: 0,
        value: defaultRange
      });

      // Quick date select handler
      form.on('select(bet_quickDateFilter)', function (data) {
        if (data.value) {
          $('#bet_hsDateTime').val(data.value);
        }
      });

      // ── Cascading dropdown: Lottery → Play Type ──
      form.on('select(bet_lotteryFilter)', function (data) {
        var lotteryId = data.value;
        var selOpt = '<option value="">' + HubLang.t('select') + '</option>';
        $('#bet_playTypeSelect').html(selOpt);
        $('#bet_playSelect').html(selOpt);
        form.render('select');
        if (!lotteryId) return;

        $.ajax({
          url: '/api/action/getLottery',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({ type: 'getPlayType', lottery_id: lotteryId }),
          success: function (res) {
            if (res.data && res.data.playTypeData) {
              var html = '<option value="">' + HubLang.t('select') + '</option>';
              res.data.playTypeData.forEach(function (item) {
                html += '<option value="' + item.id + '">' + item.name + '</option>';
              });
              $('#bet_playTypeSelect').html(html);
              form.render('select');
            }
          }
        });
      });

      // ── Cascading dropdown: Play Type → Play ──
      form.on('select(bet_playTypeFilter)', function (data) {
        var playTypeId = data.value;
        var selOpt = '<option value="">' + HubLang.t('select') + '</option>';
        $('#bet_playSelect').html(selOpt);
        form.render('select');
        if (!playTypeId) return;

        var lotteryId = $('select[name="lottery_id"]', container).val();
        $.ajax({
          url: '/api/action/getLottery',
          method: 'POST',
          contentType: 'application/json',
          data: JSON.stringify({ type: 'getPlay', lottery_id: lotteryId, play_type_id: playTypeId }),
          success: function (res) {
            if (res.data && res.data.playData) {
              var html = '<option value="">' + HubLang.t('select') + '</option>';
              res.data.playData.forEach(function (item) {
                html += '<option value="' + item.id + '">' + item.name + '</option>';
              });
              $('#bet_playSelect').html(html);
              form.render('select');
            }
          }
        });
      });

      // ── Load summary totals asynchronously ──
      function loadTotalData(searchParams) {
        var params = {};
        for (var k in searchParams) {
          if (searchParams.hasOwnProperty(k)) params[k] = searchParams[k];
        }
        $.ajax({
          url: '/api/data/lottery-bets-summary',
          method: 'GET',
          data: params,
          success: function (res) {
            var totalData = res.total_data;
            if (!totalData) return;
            var map = {
              'bet_total_money': totalData.total_money,
              'bet_total_rebate_amount': totalData.total_rebate_amount,
              'bet_total_result': totalData.total_result
            };
            for (var id in map) {
              var val = map[id];
              if (val === undefined || val === null) val = '0.0000';
              var el = container.querySelector('#' + id);
              if (el) el.textContent = val;
            }
          }
        });
      }

      // ── Table render ──
      table.render({
        elem: '#bet_dataTable',
        id: 'bet_dataTable',
        url: '/api/data/lottery-bets',
        method: 'get',
        where: { create_time: defaultRange },
        toolbar: true,
        defaultToolbar: ['filter'],
        page: true,
        limit: 10,
        text: { none: HubLang.t('noData') },
        parseData: HubUtils.parseData,
        request: { pageName: 'page', limitName: 'limit' },
        cols: [[
          { field: 'serial_no', title: HubLang.t('serialNo'), width: 200, fixed: 'left' },
          { field: 'username', title: HubLang.t('userName'), minWidth: 150 },
          { field: 'create_time', title: HubLang.t('betTime'), minWidth: 160 },
          { field: 'lottery_name', title: HubLang.t('game'), minWidth: 150 },
          { field: 'play_type_name', title: HubLang.t('gameType'), minWidth: 150 },
          { field: 'play_name', title: HubLang.t('playStyle'), minWidth: 150 },
          { field: 'issue', title: HubLang.t('issue'), minWidth: 150 },
          { field: 'content', title: HubLang.t('betContent'), minWidth: 150 },
          { field: 'money', title: HubLang.t('betMoney'), minWidth: 150 },
          { field: 'rebate_amount', title: HubLang.t('betRebate'), minWidth: 150 },
          { field: 'result', title: HubLang.t('betResult'), minWidth: 150 },
          { field: 'status_text', title: HubLang.t('status'), fixed: 'right', width: 100 }
        ]],
        done: function (res) {
          console.log('[bet] \u0110\u00e3 t\u1ea3i ' + (res.data ? res.data.length : 0) + '/' + res.count + ' \u0111\u01a1n c\u01b0\u1ee3c');
          if (res.count > 0) {
            loadTotalData(form.val('bet_searchForm'));
          }
        }
      });

      // ── Search submit ──
      form.on('submit(bet_doSearch)', function (data) {
        table.reload('bet_dataTable', { where: data.field, page: { curr: 1 } });
        return false;
      });

      // ── Reset button ──
      var btnReset = container.querySelector('#bet_btnReset');
      if (btnReset) {
        btnReset.addEventListener('click', function () {
          setTimeout(function () {
            var dateEl = container.querySelector('#bet_hsDateTime');
            if (dateEl) dateEl.value = defaultRange;
            var selOpt = '<option value="">' + HubLang.t('select') + '</option>';
            $('#bet_playTypeSelect').html(selOpt);
            $('#bet_playSelect').html(selOpt);
            form.render('select');
            table.reload('bet_dataTable', {
              where: {
                create_time: defaultRange,
                username: '',
                serial_no: '',
                lottery_id: '',
                play_type_id: '',
                play_id: '',
                status: ''
              },
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
