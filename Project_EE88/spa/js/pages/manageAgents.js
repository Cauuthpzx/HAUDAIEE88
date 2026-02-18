(function () {
  var _adminSSE = null;

  SpaPages.manageAgents = {
    getHTML: function () {
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-card-header"><fieldset class="layui-elem-field layui-field-title">'
        + '<legend data-i18n="manageAgentsTitle">Quản lý tài khoản Agent EE88</legend>'
        + '</fieldset></div>'
        + '<div class="layui-card-body"><table id="ma_dataTable" lay-filter="ma_dataTable"></table></div>'
        + '</div></div></div>';
    },

    init: function (container) {
      var table = layui.table;
      var form = layui.form;
      var layer = layui.layer;
      var $ = layui.$;

      // Toolbar HTML (inline, not script tag)
      var toolbarHtml = '<div class="layui-btn-group">'
        + '<button class="layui-btn layui-btn-xs" lay-event="addAgent"><i class="hi hi-circle-plus"></i> ' + HubLang.t('addAgentMgmt') + '</button>'
        + '<button class="layui-btn layui-btn-xs layui-btn-normal" lay-event="checkAll"><i class="hi hi-arrows-rotate"></i> ' + HubLang.t('checkAll') + '</button>'
        + '<button class="layui-btn layui-btn-xs layui-btn-warm" lay-event="loginAll"><i class="hi hi-fire"></i> ' + HubLang.t('loginAllBtn') + '</button>'
        + '</div><span id="ma_solverStatus"></span>';

      function checkSolverStatus() {
        HubAPI.adminGet('solver-status').then(function (res) {
          var el = container.querySelector('#ma_solverStatus');
          if (!el) return;
          if (res.code === 0 && res.data && res.data.running) {
            el.innerHTML = '<span class="layui-btn layui-btn-xs solver-status" style="background:#16b777;border-color:#16b777;">' + HubLang.t('solverOn') + '</span>';
          } else {
            el.innerHTML = '<span class="layui-btn layui-btn-xs layui-btn-danger solver-status">' + HubLang.t('solverOff') + '</span>';
          }
        }).catch(function () {});
      }

      function loadAgents() {
        var loadIdx = layer.load();
        HubAPI.adminGet('agents').then(function (res) {
          layer.close(loadIdx);
          if (res.code === 0) {
            table.render({
              elem: '#ma_dataTable',
              toolbar: toolbarHtml,
              defaultToolbar: ['filter'],
              data: res.data,
              text: { none: HubLang.t('noAgents') },
              cols: [[
                { field: 'id', title: 'ID', width: 60 },
                { field: 'label', title: HubLang.t('agentLabel'), minWidth: 130 },
                { title: HubLang.t('ee88Account'), minWidth: 150, templet: function (d) {
                  if (d.has_credentials) return '<span style="color:#16b777;"><i class="hi hi-circle-check"></i> ' + d.ee88_username + '</span>';
                  return '<span style="color:#999;">' + HubLang.t('ee88NotConfigured') + '</span>';
                }},
                { field: 'base_url', title: 'URL', minWidth: 220 },
                { field: 'status', title: HubLang.t('status'), minWidth: 100, templet: function (d) {
                  return d.status === 1 ? '<span class="status-active">' + HubLang.t('active') + '</span>' : '<span class="status-inactive">' + HubLang.t('stopped') + '</span>';
                }},
                { field: 'user_count', title: 'Users', minWidth: 70 },
                { field: 'last_login', title: HubLang.t('lastLoginCol'), minWidth: 150 },
                { field: 'last_check', title: HubLang.t('lastCheck'), minWidth: 150 },
                { fixed: 'right', title: HubLang.t('actions'), width: 260, templet: function (d) {
                  var btns = '<button class="layui-btn layui-btn-xs" lay-event="edit">' + HubLang.t('edit') + '</button>'
                    + '<button class="layui-btn layui-btn-xs layui-btn-normal" lay-event="check">' + HubLang.t('check') + '</button>';
                  if (d.has_credentials) btns += '<button class="layui-btn layui-btn-xs layui-btn-warm" lay-event="login">' + HubLang.t('login') + '</button>';
                  btns += '<button class="layui-btn layui-btn-xs" lay-event="history" style="background:#7c4dff;border-color:#7c4dff;">' + HubLang.t('loginHistory') + '</button>';
                  btns += '<button class="layui-btn layui-btn-xs layui-btn-danger" lay-event="delete">' + HubLang.t('delete') + '</button>';
                  return btns;
                }}
              ]]
            });
            checkSolverStatus();
          } else {
            layer.msg(res.msg || HubLang.t('error'), { icon: 2 });
          }
        }).catch(function () {
          layer.close(loadIdx);
          layer.msg(HubLang.t('connectionError'), { icon: 2 });
        });
      }

      loadAgents();

      // ── Real-time: auto-refresh khi agent thay đổi từ session khác ──
      if (_adminSSE) { _adminSSE.close(); _adminSSE = null; }
      _adminSSE = HubAPI.subscribeAdmin(function (ev) {
        if (ev && ev.type === 'agent') loadAgents();
      });

      // Toolbar
      table.on('toolbar(ma_dataTable)', function (obj) {
        if (obj.event === 'addAgent') openAgentForm();
        else if (obj.event === 'checkAll') checkAllAgents();
        else if (obj.event === 'loginAll') loginAllAgents();
      });

      // Row
      table.on('tool(ma_dataTable)', function (obj) {
        var d = obj.data;
        switch (obj.event) {
          case 'edit': openAgentForm(d); break;
          case 'check': checkAgent(d.id); break;
          case 'login': loginAgent(d); break;
          case 'history': showLoginHistory(d); break;
          case 'delete':
            layer.confirm(HubLang.t('confirmDeleteAgent') + d.label + '"?', { icon: 3 }, function (idx) {
              layer.close(idx);
              var loadIdx = layer.load();
              HubAPI.adminRequest('agents/' + d.id, 'DELETE').then(function (res) {
                layer.close(loadIdx);
                if (res.code === 0) { layer.msg(HubLang.t('deleted'), { icon: 1 }); loadAgents(); }
                else layer.msg(res.msg || HubLang.t('failed'), { icon: 2 });
              }).catch(function () { layer.close(loadIdx); layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
            });
            break;
        }
      });

      function openAgentForm(data) {
        var isEdit = !!data;
        var title = isEdit ? HubLang.t('editAgentTitle') + data.label : HubLang.t('addNewAgentMgmt');
        var html = '<form class="layui-form" lay-filter="ma_agentForm" style="padding:15px 30px 0 0;">'
          + '<div class="layui-form-item"><label class="layui-form-label">' + HubLang.t('agentLabel') + '</label>'
          + '<div class="layui-input-block"><input type="text" name="label" value="' + (isEdit ? (data.label || '') : '') + '" placeholder="' + HubLang.t('agentExample') + '" class="layui-input" lay-verify="required"></div></div>'
          + '<div class="layui-form-item"><label class="layui-form-label">' + HubLang.t('ee88Username') + '</label>'
          + '<div class="layui-input-block"><input type="text" name="ee88_username" value="' + (isEdit ? (data.ee88_username || '') : '') + '" placeholder="' + HubLang.t('ee88Username') + '" class="layui-input" lay-verify="required" autocomplete="off"></div></div>'
          + '<div class="layui-form-item"><label class="layui-form-label">' + HubLang.t('ee88Password') + '</label>'
          + '<div class="layui-input-block"><input type="password" name="ee88_password" value="" placeholder="' + (isEdit && data.has_credentials ? HubLang.t('keepEmpty') : HubLang.t('ee88Password')) + '" class="layui-input"' + (isEdit ? '' : ' lay-verify="required"') + ' autocomplete="new-password"></div></div>'
          + '<div class="layui-form-item"><label class="layui-form-label">' + HubLang.t('baseUrlLabel') + '</label>'
          + '<div class="layui-input-block"><input type="text" name="base_url" value="' + (isEdit ? (data.base_url || '') : 'https://a2u4k.ee88dly.com') + '" placeholder="https://xxx.ee88dly.com" class="layui-input" lay-verify="required"></div></div>';
        if (isEdit) {
          html += '<div class="layui-form-item"><label class="layui-form-label">' + HubLang.t('status') + '</label>'
            + '<div class="layui-input-block"><select name="status">'
            + '<option value="1"' + (data.status === 1 ? ' selected' : '') + '>' + HubLang.t('active') + '</option>'
            + '<option value="0"' + (data.status === 0 ? ' selected' : '') + '>' + HubLang.t('stopped') + '</option>'
            + '</select></div></div>';
        }
        html += '<div class="layui-form-item"><div class="layui-input-block">'
          + '<button type="button" class="layui-btn" lay-submit lay-filter="ma_submitAgent">' + HubLang.t('confirm') + '</button>'
          + '<button type="button" class="layui-btn layui-btn-primary" id="ma_cancelBtn">' + HubLang.t('cancel') + '</button>'
          + '</div></div></form>';

        var layerIdx = layer.open({ type: 1, title: title, area: ['550px', 'auto'], content: html, success: function () {
          form.render();
          $('#ma_cancelBtn').on('click', function () { layer.close(layerIdx); });
        } });

        form.on('submit(ma_submitAgent)', function (formData) {
          var body = { label: formData.field.label, base_url: formData.field.base_url, ee88_username: formData.field.ee88_username };
          if (formData.field.ee88_password) body.ee88_password = formData.field.ee88_password;
          if (isEdit) body.status = parseInt(formData.field.status);
          var loadIdx = layer.load(2, { shade: [0.3, '#000'] });
          var url = isEdit ? 'agents/' + data.id : 'agents';
          var method = isEdit ? 'PUT' : 'POST';
          HubAPI.adminRequest(url, method, body).then(function (res) {
            layer.close(loadIdx);
            if (res.code === 0) { layer.close(layerIdx); layer.msg(res.msg || (isEdit ? HubLang.t('updated') : HubLang.t('mgmtAgentAdded')), { icon: 1, time: 3000 }); loadAgents(); }
            else layer.msg(res.msg || HubLang.t('failed'), { icon: 2 });
          }).catch(function () { layer.close(loadIdx); layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
          return false;
        });
      }

      function checkAgent(id) {
        var loadIdx = layer.load();
        HubAPI.adminRequest('agents/' + id + '/check', 'POST').then(function (res) {
          layer.close(loadIdx);
          if (res.code === 0) layer.msg(HubLang.t('agentOk'), { icon: 1 });
          else layer.msg(res.msg || HubLang.t('agentProblem'), { icon: 2 });
          loadAgents();
        }).catch(function () { layer.close(loadIdx); layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
      }

      function loginAgent(d) {
        layer.confirm(HubLang.t('loginConfirmMsg') + d.label + '"?<br><small>' + HubLang.t('loginProcessHint') + '</small>', { icon: 3 }, function (idx) {
          layer.close(idx);
          var loadIdx = layer.load(2, { shade: [0.3, '#000'] });
          HubAPI.adminRequest('agents/' + d.id + '/login', 'POST').then(function (res) {
            layer.close(loadIdx);
            if (res.code === 0) layer.msg(res.msg || HubLang.t('agentLoginSuccess'), { icon: 1 });
            else layer.msg(res.msg || HubLang.t('agentLoginFailed'), { icon: 2 });
            loadAgents();
          }).catch(function () { layer.close(loadIdx); layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
        });
      }

      function loginAllAgents() {
        layer.confirm(HubLang.t('loginAllConfirm'), { icon: 3 }, function (idx) {
          layer.close(idx);
          var loadIdx = layer.load(2, { shade: [0.3, '#000'] });
          HubAPI.adminRequest('agents/login-all', 'POST').then(function (res) {
            layer.close(loadIdx);
            if (res.code === 0) {
              var d = res.data;
              var msg = HubLang.t('loginAllDone') + ': ' + d.success + ' OK, ' + d.fail + ' fail';
              layer.msg(msg, { icon: d.fail === 0 ? 1 : 0, time: 4000 });
              loadAgents();
            } else {
              layer.msg(res.msg || HubLang.t('failed'), { icon: 2 });
            }
          }).catch(function () { layer.close(loadIdx); layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
        });
      }

      function showLoginHistory(d) {
        var loadIdx = layer.load();
        HubAPI.adminGet('agents/' + d.id + '/login-history').then(function (res) {
          layer.close(loadIdx);
          if (res.code !== 0) return layer.msg(HubLang.t('error'), { icon: 2 });
          var rows = res.data || [];
          var html = '<table class="layui-table" style="margin:0;">'
            + '<thead><tr>'
            + '<th>' + HubLang.t('time') + '</th>'
            + '<th>' + HubLang.t('successCol') + '</th>'
            + '<th>' + HubLang.t('attemptsCol') + '</th>'
            + '<th>' + HubLang.t('durationCol') + '</th>'
            + '<th>' + HubLang.t('sourceCol') + '</th>'
            + '<th>' + HubLang.t('triggeredByCol') + '</th>'
            + '<th>' + HubLang.t('errorCol') + '</th>'
            + '</tr></thead><tbody>';
          if (rows.length === 0) {
            html += '<tr><td colspan="7" style="text-align:center;">' + HubLang.t('noData') + '</td></tr>';
          } else {
            rows.forEach(function (r) {
              var icon = r.success ? '<span style="color:#16b777;">OK</span>' : '<span style="color:#ff5722;">FAIL</span>';
              html += '<tr>'
                + '<td>' + (r.created_at || '') + '</td>'
                + '<td>' + icon + '</td>'
                + '<td>' + (r.attempts || 0) + '</td>'
                + '<td>' + (r.duration_ms || '-') + '</td>'
                + '<td>' + (r.source || '') + '</td>'
                + '<td>' + (r.triggered_by || '-') + '</td>'
                + '<td>' + (r.error_msg || '') + '</td>'
                + '</tr>';
            });
          }
          html += '</tbody></table>';
          layer.open({
            type: 1,
            title: HubLang.t('loginHistoryTitle') + ' — ' + d.label,
            area: ['750px', '450px'],
            content: '<div style="padding:10px;overflow:auto;max-height:380px;">' + html + '</div>'
          });
        }).catch(function () { layer.close(loadIdx); layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
      }

      function checkAllAgents() {
        var loadIdx = layer.load();
        HubAPI.adminGet('agents').then(function (res) {
          if (res.code !== 0 || !res.data) { layer.close(loadIdx); return layer.msg(HubLang.t('error'), { icon: 2 }); }
          var agents = res.data;
          var checked = 0;
          var results = [];
          agents.forEach(function (agent) {
            HubAPI.adminRequest('agents/' + agent.id + '/check', 'POST').then(function (r) {
              results.push({ label: agent.label, ok: r.code === 0 });
            }).catch(function () {
              results.push({ label: agent.label, ok: false });
            }).finally(function () {
              checked++;
              if (checked === agents.length) {
                layer.close(loadIdx);
                var ok = results.filter(function (r) { return r.ok; }).length;
                layer.msg(ok + '/' + agents.length + HubLang.t('agentsWorking'), { icon: ok === agents.length ? 1 : 0 });
                loadAgents();
              }
            });
          });
        }).catch(function () { layer.close(loadIdx); layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
      }
    },

    destroy: function () {
      if (_adminSSE) { _adminSSE.close(); _adminSSE = null; }
    },
    onLangChange: function (container) {
      container.innerHTML = this.getHTML();
      HubLang.applyDOM(container);
      this.init(container);
    }
  };
})();
