(function () {
  var pieChart = null, barChart = null;
  var echartsLoaded = false;

  SpaPages.dashboard = {
    getHTML: function () {
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-card-header">'
        + '<fieldset class="layui-elem-field layui-field-title">'
        + '<legend data-i18n="dashboard">' + HubLang.t('dashboard') + '</legend>'
        + '<div class="layui-field-box">'

        // ── Stat Cards (inside card header) ──
        + '<div style="display:flex;gap:15px;flex-wrap:wrap;">'
        + '<div style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 18px;text-align:center;">'
        + '<div style="font-size:28px;font-weight:700;color:#16b777;" id="db_activeCount">-</div>'
        + '<div style="font-size:12px;color:#999;margin-top:4px;" data-i18n="dbActiveAgents">' + HubLang.t('dbActiveAgents') + '</div>'
        + '</div>'
        + '<div style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 18px;text-align:center;">'
        + '<div style="font-size:28px;font-weight:700;color:#ff5722;" id="db_expiredCount">-</div>'
        + '<div style="font-size:12px;color:#999;margin-top:4px;" data-i18n="dbExpiredAgents">' + HubLang.t('dbExpiredAgents') + '</div>'
        + '</div>'
        + '<div style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 18px;text-align:center;">'
        + '<div style="font-size:28px;font-weight:700;color:#1e9fff;" id="db_loginOk">-</div>'
        + '<div style="font-size:12px;color:#999;margin-top:4px;" data-i18n="dbLoginSuccess">' + HubLang.t('dbLoginSuccess') + '</div>'
        + '</div>'
        + '<div style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 18px;text-align:center;">'
        + '<div style="font-size:28px;font-weight:700;color:#ffb800;" id="db_loginFail">-</div>'
        + '<div style="font-size:12px;color:#999;margin-top:4px;" data-i18n="dbLoginFail">' + HubLang.t('dbLoginFail') + '</div>'
        + '</div>'
        + '</div>'

        + '</div></fieldset></div>'

        // ── Card Body: Charts + Activity ──
        + '<div class="layui-card-body">'
        // Charts row
        + '<div class="layui-row layui-col-space15">'
        + '<div class="layui-col-md6">'
        + '<div style="font-size:13px;color:#999;margin-bottom:8px;" data-i18n="dbAgentStatus">' + HubLang.t('dbAgentStatus') + '</div>'
        + '<div id="db_pieChart" style="height:280px;"></div>'
        + '</div>'
        + '<div class="layui-col-md6">'
        + '<div style="font-size:13px;color:#999;margin-bottom:8px;" data-i18n="dbLoginStats">' + HubLang.t('dbLoginStats') + '</div>'
        + '<div id="db_barChart" style="height:280px;"></div>'
        + '</div>'
        + '</div>'
        // Activity table
        + '<div style="margin-top:15px;">'
        + '<div style="font-size:13px;color:#999;margin-bottom:8px;" data-i18n="dbRecentActivity">' + HubLang.t('dbRecentActivity') + '</div>'
        + '<table id="db_activityTable"></table>'
        + '</div>'
        + '</div>'

        + '</div></div></div>';
    },

    init: function (container) {
      var $ = layui.$;
      var table = layui.table;

      function loadData() {
        HubAPI.adminGet('dashboard/stats').then(function (res) {
          if (res.code !== 0) return;
          var d = res.data;

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

          renderCharts(d, container);

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
          barEl.innerHTML = '<div style="text-align:center;padding:120px 0;color:#999;">' + HubLang.t('noData') + '</div>';
        }

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
