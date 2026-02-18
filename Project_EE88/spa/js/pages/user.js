(function () {
  SpaPages.user = {
    getHTML: function () {
      // ── Inline toolbar HTML (no <script> tag in SPA) ──
      var toolbarHtml = '<div class="layui-btn-group">'
        + '<button class="layui-btn layui-btn-xs" lay-event="addMember">'
        + '<i class="layui-icon layui-icon-addition"></i>'
        + '<span data-i18n="addMemberBtn">' + HubLang.t('addMemberBtn') + '</span>'
        + '</button>'
        + '<button class="layui-btn layui-btn-xs" lay-event="addAgent">'
        + '<i class="layui-icon layui-icon-addition"></i>'
        + '<span data-i18n="addAgentBtn">' + HubLang.t('addAgentBtn') + '</span>'
        + '</button>'
        + '</div>';

      // ── Inline row action HTML ──
      var rowActionHtml = '<button class="layui-btn layui-btn-xs" lay-event="rebate">'
        + '<span data-i18n="setRebateBtn">' + HubLang.t('setRebateBtn') + '</span>'
        + '</button>';

      return '<div class="layui-row">'
        + '<div class="layui-col-md12">'
        + '<div class="layui-card">'
        + '<div class="layui-form layui-card-header">'
        + '<fieldset class="layui-elem-field">'
        + '<legend data-i18n="memberMgmtSub">' + HubLang.t('memberMgmtSub') + '</legend>'
        + '<div class="layui-field-box">'
        + '<form class="layui-form" lay-filter="user_searchForm">'

        + '<div class="layui-inline">'
        + '<label data-i18n="accountName">' + HubLang.t('accountName') + '</label>\uff1a'
        + '<div style="width:200px;" class="layui-input-inline">'
        + '<input type="text" name="username"'
        + ' placeholder="' + HubLang.t('enterAccountName') + '"'
        + ' class="layui-input" autocomplete="off">'
        + '</div></div>'

        + '<div class="layui-inline">'
        + '<label data-i18n="firstDepositTime">' + HubLang.t('firstDepositTime') + '</label>\uff1a'
        + '<div style="width:290px;" class="layui-input-inline">'
        + '<input type="text" name="first_deposit_time" id="user_firstDepositTime"'
        + ' placeholder="' + HubLang.t('dateStartEndTime') + '"'
        + ' class="layui-input" readonly autocomplete="off">'
        + '</div></div>'

        + '<div class="layui-inline">'
        + '<label data-i18n="status">' + HubLang.t('status') + '</label>\uff1a'
        + '<div class="layui-input-inline">'
        + '<select name="status" lay-filter="user_status">'
        + '<option value="" data-i18n="select">' + HubLang.t('select') + '</option>'
        + '<option value="0" data-i18n="statusNotEval">' + HubLang.t('statusNotEval') + '</option>'
        + '<option value="1" data-i18n="statusNormal">' + HubLang.t('statusNormal') + '</option>'
        + '<option value="2" data-i18n="statusFrozen">' + HubLang.t('statusFrozen') + '</option>'
        + '<option value="3" data-i18n="locked">' + HubLang.t('locked') + '</option>'
        + '</select>'
        + '</div></div>'

        + '<div class="layui-inline">'
        + '<label data-i18n="sortByField">' + HubLang.t('sortByField') + '</label>\uff1a'
        + '<div style="width:150px;" class="layui-input-inline">'
        + '<select name="sort_field" lay-filter="user_sortField">'
        + '<option value="" data-i18n="select">' + HubLang.t('select') + '</option>'
        + '<option value="money" data-i18n="balance">' + HubLang.t('balance') + '</option>'
        + '<option value="login_time" data-i18n="lastLoginTime">' + HubLang.t('lastLoginTime') + '</option>'
        + '<option value="register_time" data-i18n="registerTime">' + HubLang.t('registerTime') + '</option>'
        + '<option value="deposit_money" data-i18n="totalDeposit">' + HubLang.t('totalDeposit') + '</option>'
        + '<option value="withdrawal_money" data-i18n="totalWithdraw">' + HubLang.t('totalWithdraw') + '</option>'
        + '</select>'
        + '</div></div>'

        + '<div class="layui-inline">'
        + '<label data-i18n="sortDirection">' + HubLang.t('sortDirection') + '</label>\uff1a'
        + '<div style="width:150px;" class="layui-input-inline">'
        + '<select name="sort_direction" lay-filter="user_sortDirection">'
        + '<option value="desc" data-i18n="sortDesc">' + HubLang.t('sortDesc') + '</option>'
        + '<option value="asc" data-i18n="sortAsc">' + HubLang.t('sortAsc') + '</option>'
        + '</select>'
        + '</div></div>'

        + '<div class="layui-inline">'
        + '<button type="button" class="layui-btn" lay-submit lay-filter="user_doSearch">'
        + '<i class="layui-icon layui-icon-search"></i>'
        + ' <span data-i18n="search">' + HubLang.t('search') + '</span>'
        + '</button></div>'

        + '<div class="layui-inline">'
        + '<button type="reset" class="layui-btn layui-btn-primary" id="user_btnReset">'
        + '<i class="layui-icon layui-icon-refresh"></i>'
        + ' <span data-i18n="reset">' + HubLang.t('reset') + '</span>'
        + '</button></div>'

        + '</form></div>'
        + '</fieldset></div>'
        + '<div class="layui-card-body">'
        + '<table id="user_memberTable" lay-filter="user_memberTable"></table>'
        + '</div>'
        + '</div></div></div>'
        + '<script type="text/html" id="user_toolbarTpl">' + toolbarHtml + '<\/script>'
        + '<script type="text/html" id="user_rowActionTpl">' + rowActionHtml + '<\/script>';
    },

    init: function (container) {
      var table = layui.table;
      var form = layui.form;
      var laydate = layui.laydate;
      var layer = layui.layer;
      var $ = layui.$;

      // ── Date range picker for first_deposit_time ──
      laydate.render({
        elem: '#user_firstDepositTime',
        type: 'datetime',
        range: '|',
        rangeLinked: true
      });

      form.render(null, 'user_searchForm');

      // ── Table render ──
      table.render({
        elem: '#user_memberTable',
        id: 'user_memberTable',
        url: '/api/data/members',
        method: 'get',
        toolbar: '#user_toolbarTpl',
        defaultToolbar: HubUtils.getDefaultToolbar(),
        page: true,
        limit: 10,
        text: { none: HubLang.t('noData') },
        parseData: HubUtils.parseData,
        request: { pageName: 'page', limitName: 'limit' },
        cols: [[
          { field: 'username',          title: HubLang.t('member'),           width: 150, fixed: 'left' },
          { field: 'type_format',       title: HubLang.t('memberType'),       width: 130 },
          { field: 'parent_user',       title: HubLang.t('agentAccount'),     width: 150 },
          { field: 'money',             title: HubLang.t('balance'),          width: 150 },
          { field: 'deposit_count',     title: HubLang.t('depositCount'),     width: 80  },
          { field: 'withdrawal_count',  title: HubLang.t('withdrawCount'),    width: 80  },
          { field: 'deposit_amount',    title: HubLang.t('totalDeposit'),     width: 130 },
          { field: 'withdrawal_amount', title: HubLang.t('totalWithdraw'),    width: 130 },
          { field: 'login_time',        title: HubLang.t('lastLoginTime'),    width: 160 },
          { field: 'register_time',     title: HubLang.t('registerTime'),     width: 160 },
          { field: 'status_format',     title: HubLang.t('status'),           width: 100 },
          { field: 'id',                title: 'ID',                          width: 90  },
          { field: 'truename',          title: HubLang.t('truename'),         width: 150 },
          { field: 'phone',             title: HubLang.t('phone'),            width: 120 },
          { field: 'email',             title: 'Email',                       width: 180 },
          { field: 'invite_code',       title: HubLang.t('inviteCode'),       width: 100 },
          { field: 'device',            title: HubLang.t('device'),           width: 100 },
          { field: 'login_ip',          title: HubLang.t('loginIp'),          width: 150 },
          { field: 'first_deposit_time',title: HubLang.t('firstDepositTime'), width: 160 },
          { field: 'level',             title: HubLang.t('level'),            width: 80  },
          { field: 'group_id',          title: HubLang.t('groupId'),          width: 80  },
          { field: 'agent_type',        title: HubLang.t('agentType'),        width: 100 },
          { field: 'is_tester',         title: HubLang.t('isTester'),         width: 100 },
          { field: 'phone_verified',    title: HubLang.t('phoneVerified'),    width: 110 },
          { field: 'email_verified',    title: HubLang.t('emailVerified'),    width: 100 },
          { field: 'useragent',         title: HubLang.t('userAgent'),        width: 250 },
          { field: 'create_time',       title: HubLang.t('createTime'),       width: 160 },
          { field: 'update_time',       title: HubLang.t('lastUpdate'),       width: 160 },
          { field: 'remark',            title: HubLang.t('remark'),           width: 150 },
          { field: 'note',              title: HubLang.t('noteExtra'),        width: 150 },
          { field: 'user_tree',         title: HubLang.t('agentTree'),        width: 150 },
          { fixed: 'right', title: HubLang.t('actions'), width: 130, toolbar: '#user_rowActionTpl' }
        ]],
        done: function (res) {
          console.log('[user] Loaded ' + (res.data ? res.data.length : 0) + '/' + res.count + ' members');
        }
      });

      // ── Toolbar events ──
      table.on('toolbar(user_memberTable)', function (obj) {
        if (obj.event === 'LAYTABLE_XLSX') {
          HubUtils.exportExcel('user_memberTable', 'members');
          return;
        }
        switch (obj.event) {
          case 'addMember':
            openAddUserForm('member');
            break;
          case 'addAgent':
            openAddUserForm('agent');
            break;
        }
      });

      // ── Row action events ──
      table.on('tool(user_memberTable)', function (obj) {
        if (obj.event === 'rebate') {
          openRebateForm(obj.data);
        }
      });

      // ── Search submit ──
      form.on('submit(user_doSearch)', function (data) {
        table.reload('user_memberTable', {
          where: data.field,
          page: { curr: 1 }
        });
        return false;
      });

      // ── Reset button ──
      var btnReset = container.querySelector('#user_btnReset');
      if (btnReset) {
        btnReset.addEventListener('click', function () {
          setTimeout(function () {
            form.render('select', 'user_searchForm');
            var dtEl = container.querySelector('#user_firstDepositTime');
            if (dtEl) dtEl.value = '';
            table.reload('user_memberTable', {
              where: {
                username: '',
                first_deposit_time: '',
                status: '',
                sort_field: '',
                sort_direction: 'desc'
              },
              page: { curr: 1 }
            });
          }, 50);
        });
      }

      // ── openAddUserForm ──
      function openAddUserForm(type) {
        var isAgent = type === 'agent';
        var title = isAgent ? HubLang.t('addNewAgent') : HubLang.t('addNewMember');

        var formHtml = '<form class="layui-form" lay-filter="user_submitAddUser" style="padding:15px 30px 0 0;">'
          + '<div class="layui-form-item">'
          + '<label class="layui-form-label">' + HubLang.t('accountName') + '</label>'
          + '<div class="layui-input-block">'
          + '<input type="text" name="username" required lay-verify="required"'
          + ' placeholder="' + HubLang.t('chars416') + '" class="layui-input">'
          + '</div></div>'
          + '<div class="layui-form-item">'
          + '<label class="layui-form-label">' + HubLang.t('password') + '</label>'
          + '<div class="layui-input-block">'
          + '<input type="password" name="password" required lay-verify="required"'
          + ' placeholder="' + HubLang.t('chars620') + '" class="layui-input">'
          + '</div></div>'
          + '<div class="layui-form-item">'
          + '<label class="layui-form-label">' + HubLang.t('confirmPw') + '</label>'
          + '<div class="layui-input-block">'
          + '<input type="password" name="confirm_password" required lay-verify="required"'
          + ' placeholder="' + HubLang.t('retypePw') + '" class="layui-input">'
          + '</div></div>'
          + '<input type="hidden" name="type" value="' + (isAgent ? '1' : '0') + '">'
          + '<div class="layui-form-item">'
          + '<div class="layui-input-block">'
          + '<button type="button" class="layui-btn" lay-submit lay-filter="user_submitAddUser">'
          + HubLang.t('confirm')
          + '</button>'
          + '<button type="reset" class="layui-btn layui-btn-primary">'
          + HubLang.t('reset')
          + '</button>'
          + '</div></div>'
          + '</form>';

        var layerIdx = layer.open({
          type: 1,
          title: title,
          area: ['450px', 'auto'],
          content: formHtml,
          success: function () { form.render(); }
        });

        form.on('submit(user_submitAddUser)', function (formData) {
          if (formData.field.password !== formData.field.confirm_password) {
            layer.msg(HubLang.t('passwordNoMatch'), { icon: 2 });
            return false;
          }
          var loadIdx = layer.load();
          $.ajax({
            url: '/api/action/addUser',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(formData.field),
            success: function (res) {
              layer.close(loadIdx);
              if (res.code === 0 || res.code === 1) {
                layer.close(layerIdx);
                layer.msg(isAgent ? HubLang.t('agentAdded') : HubLang.t('memberAdded'), { icon: 1 });
                table.reload('user_memberTable');
              } else {
                layer.msg(res.msg || HubLang.t('failed'), { icon: 2 });
              }
            },
            error: function () {
              layer.close(loadIdx);
              layer.msg(HubLang.t('connectionError'), { icon: 2 });
            }
          });
          return false;
        });
      }

      // ── openRebateForm ──
      function openRebateForm(userData) {
        var series = HubUtils.DEFAULT_SERIES;

        var rebateInputs = '';
        for (var i = 0; i < series.length; i++) {
          rebateInputs += '<div class="layui-form-item">'
            + '<label class="layui-form-label">' + series[i].name + '</label>'
            + '<div class="layui-input-block">'
            + '<input type="number" name="rebate_' + series[i].id + '" value=""'
            + ' placeholder="0" class="layui-input" step="0.1" min="0" max="15">'
            + '</div></div>';
        }

        var formHtml = '<form class="layui-form" lay-filter="user_submitRebate" style="padding:15px 30px 0 0;">'
          + '<div class="layui-form-item">'
          + '<label class="layui-form-label">' + HubLang.t('member') + '</label>'
          + '<div class="layui-input-block">'
          + '<input type="text" value="' + userData.username + '" class="layui-input" disabled>'
          + '</div></div>'
          + '<fieldset class="layui-elem-field" style="margin:0 0 10px 110px;">'
          + '<legend style="font-size:13px;">' + HubLang.t('rebateTitle') + '</legend>'
          + '<div class="layui-field-box" style="padding:5px 15px;">'
          + rebateInputs
          + '</div></fieldset>'
          + '<div class="layui-form-item">'
          + '<div class="layui-input-block">'
          + '<button type="button" class="layui-btn" lay-submit lay-filter="user_submitRebate">'
          + HubLang.t('confirm')
          + '</button>'
          + '<button type="reset" class="layui-btn layui-btn-primary">'
          + HubLang.t('reset')
          + '</button>'
          + '</div></div>'
          + '</form>';

        var layerIdx = layer.open({
          type: 1,
          title: HubLang.t('rebateSetup') + userData.username,
          area: ['550px', 'auto'],
          content: formHtml,
          success: function () { form.render(); }
        });

        form.on('submit(user_submitRebate)', function (formData) {
          var rebateObj = {};
          for (var key in formData.field) {
            if (key.indexOf('rebate_') === 0) {
              var sid = key.replace('rebate_', '');
              rebateObj[sid] = { value: formData.field[key] || '0' };
            }
          }
          var body = {
            uid: userData.id,
            username: userData.username,
            rebate_arr: JSON.stringify(rebateObj)
          };
          var loadIdx = layer.load();
          $.ajax({
            url: '/api/action/setRebate',
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(body),
            success: function (res) {
              layer.close(loadIdx);
              if (res.code === 0 || res.code === 1) {
                layer.close(layerIdx);
                layer.msg(HubLang.t('rebateUpdated'), { icon: 1 });
              } else {
                layer.msg(res.msg || HubLang.t('failed'), { icon: 2 });
              }
            },
            error: function () {
              layer.close(loadIdx);
              layer.msg(HubLang.t('connectionError'), { icon: 2 });
            }
          });
          return false;
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
