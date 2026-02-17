(function () {
  SpaPages.manageUsers = {
    getHTML: function () {
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-card-header"><fieldset class="layui-elem-field">'
        + '<legend data-i18n="manageUsersTitle">Quản lý tài khoản Hub</legend>'
        + '</fieldset></div>'
        + '<div class="layui-card-body"><table id="mu_dataTable" lay-filter="mu_dataTable"></table></div>'
        + '</div></div></div>';
    },

    init: function (container) {
      var table = layui.table;
      var form = layui.form;
      var layer = layui.layer;
      var $ = layui.$;

      var allAgents = [];

      var toolbarHtml = '<div class="layui-btn-group">'
        + '<button class="layui-btn layui-btn-xs" lay-event="addUser">'
        + '<i class="layui-icon layui-icon-addition"></i> ' + HubLang.t('addUserBtn')
        + '</button></div>';

      function loadAgentsList() {
        return HubAPI.adminGet('agents').then(function (res) {
          if (res.code === 0) allAgents = res.data || [];
        });
      }

      function loadUsers() {
        var loadIdx = layer.load();
        Promise.all([loadAgentsList(), HubAPI.adminGet('users')]).then(function (results) {
          layer.close(loadIdx);
          var res = results[1];
          if (res.code === 0) {
            table.render({
              elem: '#mu_dataTable',
              toolbar: toolbarHtml,
              defaultToolbar: ['filter'],
              data: res.data,
              text: { none: HubLang.t('noUsers') },
              cols: [[
                { field: 'id', title: 'ID', width: 60 },
                { field: 'username', title: HubLang.t('username'), width: 140 },
                { field: 'display_name', title: HubLang.t('displayName'), width: 150 },
                { field: 'role', title: HubLang.t('role'), width: 100, templet: function (d) {
                  return d.role === 'admin' ? '<b style="color:#ff4d4f;">' + HubLang.t('roleAdmin') + '</b>' : HubLang.t('roleUser');
                }},
                { field: 'status', title: HubLang.t('status'), width: 100, templet: function (d) {
                  return d.status === 1
                    ? '<span class="status-active">' + HubLang.t('active') + '</span>'
                    : '<span class="status-inactive">' + HubLang.t('locked') + '</span>';
                }},
                { field: 'agents', title: HubLang.t('assignedAgents'), minWidth: 250, templet: function (d) {
                  if (d.role === 'admin') return '<span style="color:#999;">' + HubLang.t('allAdmin') + '</span>';
                  if (!d.agents || d.agents.length === 0) return '<span style="color:#999;">' + HubLang.t('noPermission') + '</span>';
                  return d.agents.map(function (a) { return '<span class="agent-tag">' + a.label + '</span>'; }).join('');
                }},
                { field: 'created_at', title: HubLang.t('createdAt'), width: 160 },
                { fixed: 'right', title: HubLang.t('actions'), width: 240, templet: function (d) {
                  return '<button class="layui-btn layui-btn-xs" lay-event="edit">' + HubLang.t('edit') + '</button>'
                    + '<button class="layui-btn layui-btn-xs layui-btn-warm" lay-event="permissions">' + HubLang.t('permissions') + '</button>'
                    + '<button class="layui-btn layui-btn-xs layui-btn-danger" lay-event="delete">' + HubLang.t('delete') + '</button>';
                }}
              ]]
            });
          } else {
            layer.msg(res.msg || HubLang.t('error'), { icon: 2 });
          }
        }).catch(function () {
          layer.close(loadIdx);
          layer.msg(HubLang.t('connectionError'), { icon: 2 });
        });
      }

      loadUsers();

      // Toolbar
      table.on('toolbar(mu_dataTable)', function (obj) {
        if (obj.event === 'addUser') openUserForm();
      });

      // Row
      table.on('tool(mu_dataTable)', function (obj) {
        var d = obj.data;
        switch (obj.event) {
          case 'edit': openUserForm(d); break;
          case 'permissions': openPermissions(d); break;
          case 'delete':
            layer.confirm(HubLang.t('confirmDeleteUser') + d.username + '"?', { icon: 3 }, function (idx) {
              layer.close(idx);
              var loadIdx = layer.load();
              HubAPI.adminRequest('users/' + d.id, 'DELETE').then(function (res) {
                layer.close(loadIdx);
                if (res.code === 0) { layer.msg(HubLang.t('deleted'), { icon: 1 }); loadUsers(); }
                else layer.msg(res.msg || HubLang.t('failed'), { icon: 2 });
              }).catch(function () { layer.close(loadIdx); layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
            });
            break;
        }
      });

      function openUserForm(data) {
        var isEdit = !!data;
        var title = isEdit ? HubLang.t('editUserTitle') + data.username : HubLang.t('addNewUser');
        var html = '<form class="layui-form" lay-filter="mu_userForm" style="padding:15px 30px 0 0;">'
          + '<div class="layui-form-item"><label class="layui-form-label">' + HubLang.t('username') + '</label>'
          + '<div class="layui-input-block"><input type="text" name="username" value="' + (isEdit ? data.username : '') + '" placeholder="' + HubLang.t('username') + '" class="layui-input"' + (isEdit ? ' disabled' : ' lay-verify="required"') + '></div></div>'
          + '<div class="layui-form-item"><label class="layui-form-label">' + (isEdit ? HubLang.t('newPwLabel') : HubLang.t('password')) + '</label>'
          + '<div class="layui-input-block"><input type="password" name="password" placeholder="' + (isEdit ? HubLang.t('keepEmptyPw') : HubLang.t('minChars6')) + '" class="layui-input"' + (isEdit ? '' : ' lay-verify="required"') + '></div></div>'
          + '<div class="layui-form-item"><label class="layui-form-label">' + HubLang.t('displayName') + '</label>'
          + '<div class="layui-input-block"><input type="text" name="display_name" value="' + (isEdit ? (data.display_name || '') : '') + '" placeholder="' + HubLang.t('displayName') + '" class="layui-input"></div></div>'
          + '<div class="layui-form-item"><label class="layui-form-label">' + HubLang.t('role') + '</label>'
          + '<div class="layui-input-block"><select name="role">'
          + '<option value="user"' + (!isEdit || data.role === 'user' ? ' selected' : '') + '>' + HubLang.t('roleUser') + '</option>'
          + '<option value="admin"' + (isEdit && data.role === 'admin' ? ' selected' : '') + '>' + HubLang.t('roleAdmin') + '</option>'
          + '</select></div></div>';

        if (isEdit) {
          html += '<div class="layui-form-item"><label class="layui-form-label">' + HubLang.t('status') + '</label>'
            + '<div class="layui-input-block"><select name="status">'
            + '<option value="1"' + (data.status === 1 ? ' selected' : '') + '>' + HubLang.t('active') + '</option>'
            + '<option value="0"' + (data.status === 0 ? ' selected' : '') + '>' + HubLang.t('locked') + '</option>'
            + '</select></div></div>';
        }

        html += '<div class="layui-form-item"><div class="layui-input-block">'
          + '<button type="button" class="layui-btn" lay-submit lay-filter="mu_submitUser">' + HubLang.t('confirm') + '</button>'
          + '<button type="reset" class="layui-btn layui-btn-primary">' + HubLang.t('reset') + '</button>'
          + '</div></div></form>';

        var layerIdx = layer.open({ type: 1, title: title, area: ['500px', 'auto'], content: html, success: function () { form.render(); } });

        form.on('submit(mu_submitUser)', function (formData) {
          var body = { display_name: formData.field.display_name, role: formData.field.role };
          if (!isEdit) body.username = formData.field.username;
          if (formData.field.password) body.password = formData.field.password;
          if (isEdit) body.status = parseInt(formData.field.status);

          var loadIdx = layer.load();
          var url = isEdit ? 'users/' + data.id : 'users';
          var method = isEdit ? 'PUT' : 'POST';
          HubAPI.adminRequest(url, method, body).then(function (res) {
            layer.close(loadIdx);
            if (res.code === 0) { layer.close(layerIdx); layer.msg(isEdit ? HubLang.t('updated') : HubLang.t('userAdded'), { icon: 1 }); loadUsers(); }
            else layer.msg(res.msg || HubLang.t('failed'), { icon: 2 });
          }).catch(function () { layer.close(loadIdx); layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
          return false;
        });
      }

      function openPermissions(user) {
        if (user.role === 'admin') {
          return layer.msg(HubLang.t('adminAllAccess'), { icon: 0 });
        }

        var currentAgentIds = (user.agents || []).map(function (a) { return a.id; });
        var html = '<form class="layui-form" lay-filter="mu_permForm" style="padding:15px 20px;">'
          + '<p style="margin-bottom:10px;color:#666;">' + HubLang.t('selectAgentAccess') + '<b>' + user.username + '</b>' + HubLang.t('selectAgentAccessSuffix') + '</p>';

        if (allAgents.length === 0) {
          html += '<p style="color:#999;">' + HubLang.t('noAgentYet') + '</p>';
        } else {
          allAgents.forEach(function (agent) {
            var checked = currentAgentIds.indexOf(agent.id) !== -1 ? ' checked' : '';
            html += '<div class="layui-form-item" style="margin-bottom:5px;">'
              + '<input type="checkbox" name="agent_' + agent.id + '" lay-skin="primary" title="' + agent.label + ' (ID: ' + agent.id + ')"' + checked + '>'
              + '</div>';
          });
        }

        html += '<div class="layui-form-item" style="margin-top:15px;">'
          + '<button type="button" class="layui-btn" lay-submit lay-filter="mu_submitPerm">' + HubLang.t('savePermissions') + '</button>'
          + '</div></form>';

        var layerIdx = layer.open({ type: 1, title: HubLang.t('permTitle') + user.username, area: ['450px', 'auto'], content: html, success: function () { form.render(); } });

        form.on('submit(mu_submitPerm)', function (formData) {
          var agentIds = [];
          for (var key in formData.field) {
            if (key.indexOf('agent_') === 0 && formData.field[key] === 'on') {
              agentIds.push(parseInt(key.replace('agent_', '')));
            }
          }
          var loadIdx = layer.load();
          HubAPI.adminRequest('users/' + user.id, 'PUT', { agent_ids: agentIds }).then(function (res) {
            layer.close(loadIdx);
            if (res.code === 0) { layer.close(layerIdx); layer.msg(HubLang.t('permUpdated'), { icon: 1 }); loadUsers(); }
            else layer.msg(res.msg || HubLang.t('failed'), { icon: 2 });
          }).catch(function () { layer.close(loadIdx); layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
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
