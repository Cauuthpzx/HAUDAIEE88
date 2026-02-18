(function () {
  SpaPages.activityLog = {
    getHTML: function () {
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-card-header">'
        + '<fieldset class="layui-elem-field layui-field-title">'
        + '<legend data-i18n="activityLogTitle">' + HubLang.t('activityLogTitle') + '</legend>'
        + '<div class="layui-field-box">'
        + '<form class="layui-form" lay-filter="al_searchForm">'

        // Action filter
        + '<div class="layui-inline">'
        + '<label data-i18n="actionCol">' + HubLang.t('actionCol') + '</label>\uff1a'
        + '<div class="layui-input-inline" style="width:180px;">'
        + '<select name="action" lay-filter="al_actionFilter">'
        + '<option value="" data-i18n="all">' + HubLang.t('all') + '</option>'
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
        + '<option value="data_clear">data_clear</option>'
        + '</select>'
        + '</div></div>'

        // Username filter
        + '<div class="layui-inline">'
        + '<label data-i18n="username">' + HubLang.t('username') + '</label>\uff1a'
        + '<div class="layui-input-inline" style="width:160px;">'
        + '<input type="text" name="username" placeholder="' + HubLang.t('filterUsername') + '" class="layui-input" autocomplete="off">'
        + '</div></div>'

        // Search button
        + '<div class="layui-inline">'
        + '<button type="button" class="layui-btn" lay-submit lay-filter="al_doSearch">'
        + '<i class="hi hi-magnifying-glass"></i> '
        + '<span data-i18n="search">' + HubLang.t('search') + '</span>'
        + '</button></div>'

        // Reset button
        + '<div class="layui-inline">'
        + '<button type="reset" class="layui-btn layui-btn-primary" id="al_btnReset">'
        + '<i class="hi hi-arrows-rotate"></i> '
        + '<span data-i18n="reset">' + HubLang.t('reset') + '</span>'
        + '</button></div>'

        + '</form>'
        + '</div></fieldset></div>'
        + '<div class="layui-card-body"><table id="al_dataTable" lay-filter="al_dataTable"></table></div>'
        + '</div></div></div>';
    },

    init: function (container) {
      var table = layui.table;
      var form = layui.form;
      var $ = layui.$;

      form.render(null, 'al_searchForm');

      function loadData(page, filters) {
        filters = filters || {};
        var params = 'page=' + (page || 1) + '&limit=20';
        if (filters.action) params += '&action=' + encodeURIComponent(filters.action);
        if (filters.username) params += '&username=' + encodeURIComponent(filters.username);

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

      var _currentFilters = {};

      // Page change
      table.on('page(al_dataTable)', function (obj) {
        loadData(obj.curr, _currentFilters);
      });

      // Search
      form.on('submit(al_doSearch)', function (data) {
        _currentFilters = {};
        if (data.field.action) _currentFilters.action = data.field.action;
        if (data.field.username) _currentFilters.username = data.field.username;
        loadData(1, _currentFilters);
        return false;
      });

      // Reset
      var btnReset = container.querySelector('#al_btnReset');
      if (btnReset) {
        btnReset.addEventListener('click', function () {
          setTimeout(function () {
            _currentFilters = {};
            form.render('select', 'al_searchForm');
            loadData(1);
          }, 50);
        });
      }

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
