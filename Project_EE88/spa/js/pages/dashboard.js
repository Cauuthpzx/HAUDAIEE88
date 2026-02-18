(function () {
  var lineChart = null, pieChart = null;
  var echartsLoaded = false;
  var currentRange = 'today';

  SpaPages.dashboard = {
    getHTML: function () {
      var user = HubAPI.getUser();
      var isAdmin = user && user.role === 'admin';

      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-card-header">'
        + '<fieldset class="layui-elem-field layui-field-title">'
        + '<legend data-i18n="dashboard">' + HubLang.t('dashboard') + '</legend>'
        + '<div class="layui-field-box">'

        // Date range buttons
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:15px;flex-wrap:wrap;">'
        + '<span style="font-size:13px;color:#999;" data-i18n="dbDateRange">' + HubLang.t('dbDateRange') + ':</span>'
        + '<div class="layui-btn-group">'
        + '<button class="layui-btn layui-btn-sm db-range-btn" data-range="today" data-i18n="today">' + HubLang.t('today') + '</button>'
        + '<button class="layui-btn layui-btn-sm layui-btn-primary db-range-btn" data-range="7d" data-i18n="dbLast7Days">' + HubLang.t('dbLast7Days') + '</button>'
        + '<button class="layui-btn layui-btn-sm layui-btn-primary db-range-btn" data-range="30d" data-i18n="dbLast30Days">' + HubLang.t('dbLast30Days') + '</button>'
        + '</div>'
        + '<span id="db_dateLabel" style="font-size:12px;color:#666;"></span>'
        + '</div>'

        // KPI Cards
        + '<div style="display:flex;gap:12px;flex-wrap:wrap;">'
        + kpiCard('db_totalMembers', 'dbTotalMembers', '#1e9fff')
        + kpiCard('db_newMembers', 'dbNewMembers', '#16b777')
        + kpiCard('db_activeMembers', 'dbActiveMembers', '#ffb800')
        + kpiCard('db_depositTotal', 'dbDepositTotal', '#16b777')
        + kpiCard('db_withdrawTotal', 'dbWithdrawTotal', '#ff5722')
        + kpiCard('db_netWinLoss', 'dbNetWinLoss', '#1e9fff')
        + '</div>'

        + '</div></fieldset></div>'

        // Card Body: Charts
        + '<div class="layui-card-body">'
        + '<div class="layui-row layui-col-space15">'
        + '<div class="layui-col-md8">'
        + '<div style="font-size:13px;color:#999;margin-bottom:8px;" data-i18n="dbDepositWithdrawTrend">'
          + HubLang.t('dbDepositWithdrawTrend') + '</div>'
        + '<div id="db_lineChart" style="height:300px;"></div>'
        + '</div>'
        + '<div class="layui-col-md4">'
        + '<div style="font-size:13px;color:#999;margin-bottom:8px;" data-i18n="dbWinLossBreakdown">'
          + HubLang.t('dbWinLossBreakdown') + '</div>'
        + '<div id="db_pieChart" style="height:300px;"></div>'
        + '</div>'
        + '</div>'

        // Per-agent table (admin only)
        + (isAdmin
          ? '<div style="margin-top:15px;">'
            + '<div style="font-size:13px;color:#999;margin-bottom:8px;" data-i18n="dbPerAgent">'
              + HubLang.t('dbPerAgent') + '</div>'
            + '<table id="db_agentTable"></table>'
            + '</div>'
          : '')

        + '</div>'
        + '</div></div></div>';
    },

    init: function (container) {
      // Highlight active range button
      function setActiveRange(range) {
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

      // Range button click
      var btns = container.querySelectorAll('.db-range-btn');
      for (var i = 0; i < btns.length; i++) {
        btns[i].addEventListener('click', function () {
          setActiveRange(this.getAttribute('data-range'));
          loadData(container);
        });
      }

      setActiveRange('today');
      loadData(container);
    },

    destroy: function () {
      if (lineChart) { lineChart.dispose(); lineChart = null; }
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

  function kpiCard(id, i18nKey, color) {
    return '<div style="flex:1;min-width:130px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 16px;text-align:center;">'
      + '<div style="font-size:24px;font-weight:700;color:' + color + ';" id="' + id + '">-</div>'
      + '<div style="font-size:12px;color:#999;margin-top:4px;" data-i18n="' + i18nKey + '">' + HubLang.t(i18nKey) + '</div>'
      + '</div>';
  }

  function loadData(container) {
    HubAPI.dashboardGet('stats?range=' + currentRange).then(function (res) {
      if (res.code !== 0) return;
      var d = res.data;

      // Update date label
      var label = container.querySelector('#db_dateLabel');
      if (label) label.textContent = d.startDate + ' → ' + d.endDate;

      // Update KPIs
      setText(container, 'db_totalMembers', fmtNum(d.members.total));
      setText(container, 'db_newMembers', fmtNum(d.members.new));
      setText(container, 'db_activeMembers', fmtNum(d.members.active));
      setText(container, 'db_depositTotal', fmtMoney(d.deposits.amount));
      setText(container, 'db_withdrawTotal', fmtMoney(d.withdrawals.amount));

      var netWL = (d.winLoss.lottery.winLose || 0) + (d.winLoss.thirdParty.winLose || 0);
      var el = container.querySelector('#db_netWinLoss');
      if (el) {
        el.textContent = fmtMoney(netWL);
        el.style.color = netWL >= 0 ? '#16b777' : '#ff5722';
      }

      // Render charts
      renderCharts(d, container);

      // Admin: per-agent table
      if (d.perAgent && d.perAgent.length > 0) {
        layui.table.render({
          elem: '#db_agentTable',
          data: d.perAgent,
          text: { none: HubLang.t('noData') },
          page: false,
          cols: [[
            { field: 'label', title: HubLang.t('agent'), width: 150 },
            { field: 'members', title: HubLang.t('dbTotalMembers'), width: 120, align: 'right' },
            { field: 'deposit', title: HubLang.t('dbDepositTotal'), width: 150, align: 'right',
              templet: function (row) { return fmtMoney(row.deposit); } },
            { field: 'withdrawal', title: HubLang.t('dbWithdrawTotal'), width: 150, align: 'right',
              templet: function (row) { return fmtMoney(row.withdrawal); } },
            { field: 'net', title: HubLang.t('dbNetWinLoss'), minWidth: 120, align: 'right',
              templet: function (row) {
                var net = (row.deposit || 0) - (row.withdrawal || 0);
                var color = net >= 0 ? '#16b777' : '#ff5722';
                return '<span style="color:' + color + '">' + fmtMoney(net) + '</span>';
              }
            }
          ]]
        });
      }
    }).catch(function (err) {
      console.error('[Dashboard] Load error:', err);
    });
  }

  function renderCharts(d, container) {
    if (typeof echarts === 'undefined') {
      if (echartsLoaded) return;
      echartsLoaded = true;
      var script = document.createElement('script');
      script.src = '/lib/echarts/echarts.min.js';
      script.onload = function () { doRenderCharts(d, container); };
      document.body.appendChild(script);
    } else {
      doRenderCharts(d, container);
    }
  }

  function doRenderCharts(d, container) {
    // Bar chart: daily deposit vs withdrawal trend
    var lineEl = container.querySelector('#db_lineChart');
    if (lineEl && d.dailyTrend && d.dailyTrend.length > 0) {
      if (lineChart) lineChart.dispose();
      lineChart = echarts.init(lineEl);
      lineChart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: [HubLang.t('deposit'), HubLang.t('withdraw')], textStyle: { color: '#999' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: d.dailyTrend.map(function (t) { return t.date_key; }) },
        yAxis: { type: 'value' },
        color: ['#16b777', '#ff5722'],
        series: [
          { name: HubLang.t('deposit'), type: 'bar', data: d.dailyTrend.map(function (t) { return t.deposit; }) },
          { name: HubLang.t('withdraw'), type: 'bar', data: d.dailyTrend.map(function (t) { return t.withdrawal; }) }
        ]
      });
    } else if (lineEl) {
      lineEl.innerHTML = '<div style="text-align:center;padding:120px 0;color:#999;">' + HubLang.t('noData') + '</div>';
    }

    // Pie chart: win/loss breakdown (lottery vs 3rd party)
    var pieEl = container.querySelector('#db_pieChart');
    if (pieEl) {
      var lotteryWL = d.winLoss.lottery.winLose || 0;
      var thirdWL = d.winLoss.thirdParty.winLose || 0;
      if (lotteryWL === 0 && thirdWL === 0) {
        pieEl.innerHTML = '<div style="text-align:center;padding:120px 0;color:#999;">' + HubLang.t('noData') + '</div>';
      } else {
        if (pieChart) pieChart.dispose();
        pieChart = echarts.init(pieEl);
        pieChart.setOption({
          tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
          color: ['#ffb800', '#1e9fff'],
          series: [{
            type: 'pie',
            radius: ['40%', '70%'],
            label: { formatter: '{b}: {c}', color: '#999' },
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
    if (lineChart) lineChart.resize();
    if (pieChart) pieChart.resize();
  }

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
