(function () {
  var barChart = null, pieChart = null;
  var echartsLoaded = false;
  var currentRange = 'today';

  // ── KPI config ──
  var KPI_CARDS = [
    { id: 'db_totalMembers',  i18n: 'dbTotalMembers',  icon: 'hi hi-users',             bg: '#1e9fff', accent: 'blue' },
    { id: 'db_newMembers',    i18n: 'dbNewMembers',    icon: 'hi hi-circle-plus',        bg: '#16b777', accent: 'green' },
    { id: 'db_activeMembers', i18n: 'dbActiveMembers', icon: 'hi hi-circle-check',       bg: '#ffb800', accent: 'yellow' },
    { id: 'db_depositTotal',  i18n: 'dbDepositTotal',  icon: 'hi hi-o hi-o-credit-card', bg: '#16b777', accent: 'green', hasSub: true },
    { id: 'db_withdrawTotal', i18n: 'dbWithdrawTotal',  icon: 'hi hi-o hi-o-money-bill-1', bg: '#ff5722', accent: 'red', hasSub: true },
    { id: 'db_netWinLoss',    i18n: 'dbNetWinLoss',    icon: 'hi hi-chart-bar',          bg: '#7c3aed', accent: 'purple' }
  ];

  SpaPages.dashboard = {
    getHTML: function () {
      var user = HubAPI.getUser();
      var isAdmin = user && user.role === 'admin';

      // Range bar
      var html = '<div class="db-range-bar">'
        + '<span style="font-size:13px;color:#999;" data-i18n="dbDateRange">' + HubLang.t('dbDateRange') + ':</span>'
        + '<div class="layui-btn-group">'
        + '<button class="layui-btn layui-btn-sm db-range-btn" data-range="today" data-i18n="today">' + HubLang.t('today') + '</button>'
        + '<button class="layui-btn layui-btn-sm layui-btn-primary db-range-btn" data-range="7d" data-i18n="dbLast7Days">' + HubLang.t('dbLast7Days') + '</button>'
        + '<button class="layui-btn layui-btn-sm layui-btn-primary db-range-btn" data-range="30d" data-i18n="dbLast30Days">' + HubLang.t('dbLast30Days') + '</button>'
        + '</div>'
        + '<span id="db_dateLabel" style="font-size:12px;color:#666;"></span>'
        + '</div>';

      // KPI cards
      html += '<div class="db-kpi-row">';
      for (var i = 0; i < KPI_CARDS.length; i++) {
        var c = KPI_CARDS[i];
        html += '<div class="db-kpi-card" data-accent="' + c.accent + '">'
          + '<div class="db-kpi-icon" style="background:' + c.bg + ';"><i class="' + c.icon + '"></i></div>'
          + '<div class="db-kpi-info">'
          + '<div class="db-kpi-value" id="' + c.id + '">-</div>'
          + '<div class="db-kpi-label" data-i18n="' + c.i18n + '">' + HubLang.t(c.i18n) + '</div>'
          + (c.hasSub ? '<div class="db-kpi-sub" id="' + c.id + '_sub"></div>' : '')
          + '</div></div>';
      }
      html += '</div>';

      // Charts
      html += '<div class="db-charts-row">'
        + '<div class="db-chart-box" style="flex:2;min-width:300px;">'
        + '<div class="db-chart-title" data-i18n="dbDepositWithdrawTrend">' + HubLang.t('dbDepositWithdrawTrend') + '</div>'
        + '<div id="db_barChart" style="height:300px;"></div>'
        + '</div>'
        + '<div class="db-chart-box" style="flex:1;min-width:250px;">'
        + '<div class="db-chart-title" data-i18n="dbWinLossBreakdown">' + HubLang.t('dbWinLossBreakdown') + '</div>'
        + '<div id="db_pieChart" style="height:300px;"></div>'
        + '</div>'
        + '</div>';

      // Per-agent table (admin only)
      if (isAdmin) {
        html += '<div class="db-agent-area">'
          + '<div class="layui-card"><div class="layui-card-header" data-i18n="dbPerAgent">'
          + HubLang.t('dbPerAgent') + '</div>'
          + '<div class="layui-card-body"><table id="db_agentTable" lay-filter="db_agentTable"></table></div>'
          + '</div></div>';
      }

      return html;
    },

    init: function (container) {
      // Range buttons
      var btns = container.querySelectorAll('.db-range-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function () {
          setActiveRange(this.getAttribute('data-range'), container);
          loadData(container);
        });
      }
      setActiveRange('today', container);
      loadData(container);
    },

    destroy: function () {
      if (barChart) { barChart.dispose(); barChart = null; }
      if (pieChart) { pieChart.dispose(); pieChart = null; }
      window.removeEventListener('resize', resizeCharts);
    },

    onLangChange: function (container) {
      SpaPages.dashboard.destroy();
      container.innerHTML = SpaPages.dashboard.getHTML();
      HubLang.applyDOM(container);
      SpaPages.dashboard.init(container);
    }
  };

  // ── Helpers ──

  function setActiveRange(range, container) {
    currentRange = range;
    var btns = container.querySelectorAll('.db-range-btn');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute('data-range') === range) {
        btns[i].className = btns[i].className.replace(' layui-btn-primary', '');
      } else if (btns[i].className.indexOf('layui-btn-primary') === -1) {
        btns[i].className += ' layui-btn-primary';
      }
    }
  }

  function loadData(container) {
    // Loading state on KPI values
    for (var i = 0; i < KPI_CARDS.length; i++) {
      setText(container, KPI_CARDS[i].id, '...');
    }

    HubAPI.dashboardGet('stats?range=' + currentRange).then(function (res) {
      if (res.code !== 0) {
        showError(container, res.msg || 'Unknown error');
        return;
      }
      var d = res.data;

      // Date label
      var label = container.querySelector('#db_dateLabel');
      if (label) label.textContent = d.startDate + ' → ' + d.endDate;

      // KPI values
      setText(container, 'db_totalMembers', fmtNum(d.members.total));
      setText(container, 'db_newMembers', fmtNum(d.members.new));
      setText(container, 'db_activeMembers', fmtNum(d.members.active));
      setText(container, 'db_depositTotal', fmtMoney(d.deposits.amount));
      setText(container, 'db_withdrawTotal', fmtMoney(d.withdrawals.amount));

      // Deposit/withdrawal sub-info (count)
      var depSub = container.querySelector('#db_depositTotal_sub');
      if (depSub) depSub.textContent = fmtNum(d.deposits.count) + ' ' + HubLang.t('dbOrders');
      var wdSub = container.querySelector('#db_withdrawTotal_sub');
      if (wdSub) wdSub.textContent = fmtNum(d.withdrawals.count) + ' ' + HubLang.t('dbOrders');

      // Net win/loss (color-coded)
      var netWL = (d.winLoss.lottery.winLose || 0) + (d.winLoss.thirdParty.winLose || 0);
      var el = container.querySelector('#db_netWinLoss');
      if (el) {
        el.textContent = fmtMoney(netWL);
        el.style.color = netWL >= 0 ? '#16b777' : '#ff5722';
      }

      // Charts
      renderCharts(d, container);

      // Admin: per-agent table
      if (d.perAgent && d.perAgent.length > 0) {
        renderAgentTable(d, container);
      }
    }).catch(function (err) {
      console.error('[Dashboard] Load error:', err);
      showError(container, err.message);
    });
  }

  function showError(container, msg) {
    // Show error in chart areas
    var barEl = container.querySelector('#db_barChart');
    if (barEl) barEl.innerHTML = '<div class="db-error">' + HubLang.t('dbError') + '</div>';
    var pieEl = container.querySelector('#db_pieChart');
    if (pieEl) pieEl.innerHTML = '<div class="db-error">' + HubLang.t('dbError') + '</div>';
  }

  // ── Charts ──

  function renderCharts(d, container) {
    if (typeof echarts === 'undefined') {
      if (echartsLoaded) return;
      echartsLoaded = true;
      var script = document.createElement('script');
      script.src = '/lib/echarts/echarts.min.js';
      script.onload = function () { doRenderCharts(d, container); };
      script.onerror = function () { showError(container, 'ECharts load failed'); };
      document.body.appendChild(script);
    } else {
      doRenderCharts(d, container);
    }
  }

  function doRenderCharts(d, container) {
    // Bar chart: daily deposit vs withdrawal trend
    var barEl = container.querySelector('#db_barChart');
    if (barEl && d.dailyTrend && d.dailyTrend.length > 0) {
      if (barChart) barChart.dispose();
      barChart = echarts.init(barEl);
      barChart.setOption({
        tooltip: {
          trigger: 'axis',
          formatter: function (params) {
            var s = params[0].axisValue + '<br/>';
            for (var i = 0; i < params.length; i++) {
              s += params[i].marker + ' ' + params[i].seriesName + ': <b>' + fmtMoney(params[i].value) + '</b><br/>';
            }
            return s;
          }
        },
        legend: { data: [HubLang.t('deposit'), HubLang.t('withdraw')], textStyle: { color: '#999' }, bottom: 0 },
        grid: { left: '3%', right: '4%', top: 30, bottom: 35, containLabel: true },
        xAxis: {
          type: 'category',
          data: d.dailyTrend.map(function (t) { return t.date_key.substring(5); }),
          axisLabel: { color: '#999', fontSize: 11 }
        },
        yAxis: {
          type: 'value',
          axisLabel: {
            color: '#999', fontSize: 11,
            formatter: function (v) { return v >= 1000000 ? (v / 1000000).toFixed(1) + 'M' : v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v; }
          },
          splitLine: { lineStyle: { color: '#f0f0f0' } }
        },
        color: ['#16b777', '#ff5722'],
        series: [
          {
            name: HubLang.t('deposit'), type: 'bar', barMaxWidth: 20,
            data: d.dailyTrend.map(function (t) { return t.deposit; }),
            itemStyle: { borderRadius: [3, 3, 0, 0] }
          },
          {
            name: HubLang.t('withdraw'), type: 'bar', barMaxWidth: 20,
            data: d.dailyTrend.map(function (t) { return t.withdrawal; }),
            itemStyle: { borderRadius: [3, 3, 0, 0] }
          }
        ]
      });
    } else if (barEl) {
      barEl.innerHTML = '<div class="db-no-data">' + HubLang.t('noData') + '</div>';
    }

    // Pie chart: win/loss breakdown
    var pieEl = container.querySelector('#db_pieChart');
    if (pieEl) {
      var lotteryWL = d.winLoss.lottery.winLose || 0;
      var thirdWL = d.winLoss.thirdParty.winLose || 0;
      if (lotteryWL === 0 && thirdWL === 0) {
        pieEl.innerHTML = '<div class="db-no-data">' + HubLang.t('noData') + '</div>';
      } else {
        if (pieChart) pieChart.dispose();
        pieChart = echarts.init(pieEl);
        pieChart.setOption({
          tooltip: {
            trigger: 'item',
            formatter: function (p) { return p.name + ': <b>' + fmtMoney(p.value) + '</b> (' + p.percent + '%)'; }
          },
          legend: { bottom: 0, textStyle: { color: '#999', fontSize: 11 } },
          color: ['#ffb800', '#1e9fff'],
          series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            center: ['50%', '45%'],
            label: { show: false },
            emphasis: { label: { show: true, fontWeight: 'bold' } },
            data: [
              { value: Math.abs(lotteryWL), name: HubLang.t('dbLotteryWL') },
              { value: Math.abs(thirdWL), name: HubLang.t('dbThirdPartyWL') }
            ]
          }]
        });
      }
    }

    window.removeEventListener('resize', resizeCharts);
    window.addEventListener('resize', resizeCharts);
  }

  function resizeCharts() {
    if (barChart) barChart.resize();
    if (pieChart) pieChart.resize();
  }

  // ── Per-agent table ──

  function renderAgentTable(d, container) {
    layui.table.render({
      elem: '#db_agentTable',
      data: d.perAgent,
      text: { none: HubLang.t('noData') },
      page: false,
      cols: [[
        { field: 'label', title: HubLang.t('agent'), width: 120 },
        { field: 'members', title: HubLang.t('dbTotalMembers'), width: 100, align: 'right',
          templet: function (row) { return fmtNum(row.members); } },
        { field: 'deposit', title: HubLang.t('dbDepositTotal'), width: 130, align: 'right',
          templet: function (row) { return '<span style="color:#16b777">' + fmtMoney(row.deposit) + '</span>'; } },
        { field: 'withdrawal', title: HubLang.t('dbWithdrawTotal'), width: 130, align: 'right',
          templet: function (row) { return '<span style="color:#ff5722">' + fmtMoney(row.withdrawal) + '</span>'; } },
        { field: 'lotteryWL', title: HubLang.t('dbLotteryWL'), width: 130, align: 'right',
          templet: function (row) {
            var v = row.lotteryWL || 0;
            return '<span style="color:' + (v >= 0 ? '#16b777' : '#ff5722') + '">' + fmtMoney(v) + '</span>';
          } },
        { field: 'thirdWL', title: HubLang.t('dbThirdPartyWL'), width: 130, align: 'right',
          templet: function (row) {
            var v = row.thirdWL || 0;
            return '<span style="color:' + (v >= 0 ? '#16b777' : '#ff5722') + '">' + fmtMoney(v) + '</span>';
          } },
        { field: 'net', title: HubLang.t('dbNet'), minWidth: 120, align: 'right',
          templet: function (row) {
            var net = (row.deposit || 0) - (row.withdrawal || 0);
            return '<span style="color:' + (net >= 0 ? '#16b777' : '#ff5722') + '">' + fmtMoney(net) + '</span>';
          }
        }
      ]]
    });
  }

  // ── Format helpers ──

  function setText(container, id, text) {
    var el = container.querySelector('#' + id);
    if (el) el.textContent = text;
  }

  function fmtNum(n) {
    return (n || 0).toLocaleString();
  }

  function fmtMoney(n) {
    n = n || 0;
    return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }
})();
