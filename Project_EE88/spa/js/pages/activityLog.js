(function () {
  SpaPages.activityLog = {
    getHTML: function () {
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-card-header"><fieldset class="layui-elem-field layui-field-title">'
        + '<legend data-i18n="activityLogTitle">Nhật ký hoạt động</legend>'
        + '</fieldset></div>'
        + '<div class="layui-card-body">'
        + '<div class="layui-form" style="margin-bottom:15px;">'
        + '<div class="layui-inline"><select id="al_actionFilter" lay-filter="al_actionFilter">'
        + '<option value="">' + HubLang.t('filterAction') + '</option>'
        + '<option value="hub_login">hub_login</option>'
        + '<option value="agent_add">agent_add</option>'
        + '<option value="agent_edit">agent_edit</option>'
        + '<option value="agent_delete">agent_delete</option>'
        + '<option value="agent_login_success">agent_login_success</option>'
        + '<option value="agent_login_fail">agent_login_fail</option>'
        + '<option value="agent_login_all">agent_login_all</option>'
        + '<option value="user_add">user_add</option>'
        + '<option value="user_edit">user_edit</option>'
        + '<option value="user_delete">user_delete</option>'
        + '</select></div>'
        + '<div class="layui-inline"><input type="text" id="al_usernameFilter" class="layui-input" placeholder="' + HubLang.t('filterUsername') + '" style="width:160px;"></div>'
        + '<div class="layui-inline"><button class="layui-btn layui-btn-sm" id="al_searchBtn"><i class="layui-icon layui-icon-search"></i> ' + HubLang.t('search') + '</button>'
        + '<button class="layui-btn layui-btn-sm layui-btn-primary" id="al_resetBtn"><i class="layui-icon layui-icon-refresh"></i> ' + HubLang.t('reset') + '</button></div>'
        + '</div>'
        + '<table id="al_dataTable" lay-filter="al_dataTable"></table>'
        + '</div></div></div></div>';
    },

    init: function (container) {
      var table = layui.table;
      var form = layui.form;
      var $ = layui.$;

      form.render('select', null);

      function loadData(page) {
        var action = container.querySelector('#al_actionFilter').value || '';
        var username = container.querySelector('#al_usernameFilter').value || '';
        var params = 'page=' + (page || 1) + '&limit=20';
        if (action) params += '&action=' + encodeURIComponent(action);
        if (username) params += '&username=' + encodeURIComponent(username);

        HubAPI.adminGet('activity-log?' + params).then(function (res) {
          if (res.code !== 0) return;
          table.render({
            elem: '#al_dataTable',
            data: res.data,
            text: { none: HubLang.t('noData') },
            page: {
              layout: ['count', 'prev', 'page', 'next'],
              curr: res.page,
              count: res.count,
              limit: res.limit
            },
            cols: [[
              { field: 'id', title: 'ID', width: 70 },
              { field: 'created_at', title: HubLang.t('time'), width: 160 },
              { field: 'username', title: HubLang.t('username'), width: 120 },
              { field: 'action', title: HubLang.t('actionCol'), width: 170 },
              { field: 'target_label', title: HubLang.t('targetCol'), width: 140 },
              { field: 'ip', title: 'IP', width: 130 },
              { field: 'detail', title: HubLang.t('detailCol'), minWidth: 160 }
            ]]
          });
        }).catch(function () {});
      }

      // Page change
      table.on('page(al_dataTable)', function (obj) {
        loadData(obj.curr);
      });

      // Search + Reset
      $(container).on('click', '#al_searchBtn', function () { loadData(1); });
      $(container).on('click', '#al_resetBtn', function () {
        container.querySelector('#al_actionFilter').value = '';
        container.querySelector('#al_usernameFilter').value = '';
        form.render('select', null);
        loadData(1);
      });

      loadData(1);
    },

    destroy: function () {},

    onLangChange: function (container) {
      container.innerHTML = SpaPages.activityLog.getHTML();
      HubLang.applyDOM(container);
      SpaPages.activityLog.init(container);
    }
  };
})();
