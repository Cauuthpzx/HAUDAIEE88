(function () {
  var pieChart = null, barChart = null;
  var echartsLoaded = false;

  SpaPages.dashboard = {
    getHTML: function () {
      return '<div class="layui-row layui-col-space15" id="db_cards">'
        // Row 1: 4 stat cards
        + '<div class="layui-col-md3"><div class="layui-card" style="text-align:center;padding:20px 0;">'
        + '<div style="font-size:32px;font-weight:700;color:#16b777;" id="db_activeCount">-</div>'
        + '<div style="color:#666;margin-top:5px;" data-i18n="dbActiveAgents">Agent hoạt động</div>'
        + '</div></div>'
        + '<div class="layui-col-md3"><div class="layui-card" style="text-align:center;padding:20px 0;">'
        + '<div style="font-size:32px;font-weight:700;color:#ff5722;" id="db_expiredCount">-</div>'
        + '<div style="color:#666;margin-top:5px;" data-i18n="dbExpiredAgents">Agent hết hạn</div>'
        + '</div></div>'
        + '<div class="layui-col-md3"><div class="layui-card" style="text-align:center;padding:20px 0;">'
        + '<div style="font-size:32px;font-weight:700;color:#1e9fff;" id="db_loginOk">-</div>'
        + '<div style="color:#666;margin-top:5px;" data-i18n="dbLoginSuccess">Login OK (7d)</div>'
        + '</div></div>'
        + '<div class="layui-col-md3"><div class="layui-card" style="text-align:center;padding:20px 0;">'
        + '<div style="font-size:32px;font-weight:700;color:#ffb800;" id="db_loginFail">-</div>'
        + '<div style="color:#666;margin-top:5px;" data-i18n="dbLoginFail">Login Fail (7d)</div>'
        + '</div></div>'
        // Row 2: 2 charts
        + '<div class="layui-col-md6"><div class="layui-card">'
        + '<div class="layui-card-header" data-i18n="dbAgentStatus">Trạng thái Agent</div>'
        + '<div class="layui-card-body"><div id="db_pieChart" style="height:300px;"></div></div>'
        + '</div></div>'
        + '<div class="layui-col-md6"><div class="layui-card">'
        + '<div class="layui-card-header" data-i18n="dbLoginStats">Thống kê Login (7 ngày)</div>'
        + '<div class="layui-card-body"><div id="db_barChart" style="height:300px;"></div></div>'
        + '</div></div>'
        // Row 3: Recent activity
        + '<div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-card-header" data-i18n="dbRecentActivity">Hoạt động gần đây</div>'
        + '<div class="layui-card-body"><table id="db_activityTable"></table></div>'
        + '</div></div>'
        + '</div>';
    },

    init: function (container) {
      var $ = layui.$;
      var table = layui.table;

      function loadData() {
        HubAPI.adminGet('dashboard/stats').then(function (res) {
          if (res.code !== 0) return;
          var d = res.data;

          // Stat cards
          var el = function (id) { return container.querySelector('#' + id); };
          if (el('db_activeCount')) el('db_activeCount').textContent = d.agentCount.active;
          if (el('db_expiredCount')) el('db_expiredCount').textContent = d.agentCount.expired;

          var totalOk = 0, totalFail = 0;
          (d.loginStats || []).forEach(function (s) {
            totalOk += s.success_count || 0;
            totalFail += s.fail_count || 0;
          });
          if (el('db_loginOk')) el('db_loginOk').textContent = totalOk;
          if (el('db_loginFail')) el('db_loginFail').textContent = totalFail;

          // Render charts
          renderCharts(d, container);

          // Recent activity table
          table.render({
            elem: '#db_activityTable',
            data: d.recentActivity || [],
            text: { none: HubLang.t('noData') },
            page: false,
            cols: [[
              { field: 'created_at', title: HubLang.t('time'), width: 160 },
              { field: 'username', title: HubLang.t('username'), width: 120 },
              { field: 'action', title: HubLang.t('actionCol'), width: 160 },
              { field: 'target_label', title: HubLang.t('targetCol'), width: 140 },
              { field: 'ip', title: 'IP', width: 130 },
              { field: 'detail', title: HubLang.t('detailCol'), minWidth: 150 }
            ]]
          });
        }).catch(function () {});
      }

      function renderCharts(d, container) {
        if (typeof echarts === 'undefined') {
          // Lazy load ECharts
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
        // Pie chart: Agent Status
        var pieEl = container.querySelector('#db_pieChart');
        if (pieEl) {
          pieChart = echarts.init(pieEl);
          pieChart.setOption({
            tooltip: { trigger: 'item' },
            color: ['#16b777', '#ff5722'],
            series: [{
              type: 'pie',
              radius: ['40%', '70%'],
              label: { formatter: '{b}: {c}' },
              data: [
                { value: d.agentCount.active, name: HubLang.t('dbActiveAgents') },
                { value: d.agentCount.expired, name: HubLang.t('dbExpiredAgents') }
              ]
            }]
          });
        }

        // Bar chart: Login Stats per Agent
        var barEl = container.querySelector('#db_barChart');
        if (barEl && d.loginStats && d.loginStats.length > 0) {
          barChart = echarts.init(barEl);
          var labels = d.loginStats.map(function (s) { return s.agent_label || 'Agent #' + s.agent_id; });
          var okData = d.loginStats.map(function (s) { return s.success_count || 0; });
          var failData = d.loginStats.map(function (s) { return s.fail_count || 0; });

          barChart.setOption({
            tooltip: { trigger: 'axis' },
            legend: { data: [HubLang.t('dbLoginSuccess'), HubLang.t('dbLoginFail')] },
            grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
            xAxis: { type: 'category', data: labels },
            yAxis: { type: 'value', minInterval: 1 },
            color: ['#16b777', '#ff5722'],
            series: [
              { name: HubLang.t('dbLoginSuccess'), type: 'bar', data: okData },
              { name: HubLang.t('dbLoginFail'), type: 'bar', data: failData }
            ]
          });
        } else if (barEl) {
          barEl.innerHTML = '<div style="text-align:center;padding:130px 0;color:#999;">' + HubLang.t('noData') + '</div>';
        }

        // Resize handler
        window.addEventListener('resize', resizeCharts);
      }

      loadData();
    },

    destroy: function () {
      if (pieChart) { pieChart.dispose(); pieChart = null; }
      if (barChart) { barChart.dispose(); barChart = null; }
      window.removeEventListener('resize', resizeCharts);
    },

    onLangChange: function (container) {
      SpaPages.dashboard.destroy();
      container.innerHTML = SpaPages.dashboard.getHTML();
      HubLang.applyDOM(container);
      SpaPages.dashboard.init(container);
    }
  };

  function resizeCharts() {
    if (pieChart) pieChart.resize();
    if (barChart) barChart.resize();
  }
})();
