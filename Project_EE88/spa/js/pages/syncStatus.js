(function () {
  var _interval = null;
  var _allTreeData = [];

  SpaPages.syncStatus = {
    getHTML: function () {
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-card-header">'
        + '<fieldset class="layui-elem-field layui-field-title">'
        + '<legend data-i18n="syncStatus">' + HubLang.t('syncStatus') + '</legend>'
        + '<div class="layui-field-box">'

        // ── Stat Cards (inside card header) ──
        + '<div id="ss_statsArea" style="display:flex;gap:15px;margin-bottom:15px;flex-wrap:wrap;">'
        + '<div style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 18px;">'
        + '<div style="font-size:12px;color:#999;margin-bottom:4px;" data-i18n="totalCached">' + HubLang.t('totalCached') + '</div>'
        + '<div style="font-size:22px;font-weight:600;color:#1e9fff;" id="ss_statEntries">\u2014</div></div>'
        + '<div style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 18px;">'
        + '<div style="font-size:12px;color:#999;margin-bottom:4px;" data-i18n="totalRows">' + HubLang.t('totalRows') + '</div>'
        + '<div style="font-size:22px;font-weight:600;color:#16b777;" id="ss_statRows">\u2014</div></div>'
        + '<div style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 18px;">'
        + '<div style="font-size:12px;color:#999;margin-bottom:4px;" data-i18n="lockedDays">' + HubLang.t('lockedDays') + '</div>'
        + '<div style="font-size:22px;font-weight:600;color:#ffb800;" id="ss_statLocked">\u2014</div></div>'
        + '<div style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 18px;">'
        + '<div style="font-size:12px;color:#999;margin-bottom:4px;" data-i18n="lastSyncTime">' + HubLang.t('lastSyncTime') + '</div>'
        + '<div style="font-size:14px;font-weight:600;color:#ccc;" id="ss_statLastSync">\u2014</div></div>'
        + '</div>'

        // ── Filters ──
        + '<form class="layui-form" lay-filter="ss_searchForm">'

        + '<div class="layui-inline">'
        + '<label data-i18n="filterAgent">' + HubLang.t('filterAgent') + '</label>\uff1a'
        + '<div class="layui-input-inline" style="width:150px;">'
        + '<select name="agent_id" id="ss_filterAgent" lay-filter="ss_filterAgent">'
        + '<option value="" data-i18n="all">' + HubLang.t('all') + '</option>'
        + '</select>'
        + '</div></div>'

        + '<div class="layui-inline">'
        + '<label data-i18n="filterEndpoint">' + HubLang.t('filterEndpoint') + '</label>\uff1a'
        + '<div class="layui-input-inline" style="width:160px;">'
        + '<select name="endpoint" id="ss_filterEndpoint" lay-filter="ss_filterEndpoint">'
        + '<option value="" data-i18n="all">' + HubLang.t('all') + '</option>'
        + '</select>'
        + '</div></div>'

        + '<div class="layui-inline">'
        + '<label data-i18n="filterStatus">' + HubLang.t('filterStatus') + '</label>\uff1a'
        + '<div class="layui-input-inline" style="width:140px;">'
        + '<select name="status" lay-filter="ss_filterStatus">'
        + '<option value="" data-i18n="all">' + HubLang.t('all') + '</option>'
        + '<option value="success" data-i18n="syncSuccess">' + HubLang.t('syncSuccess') + '</option>'
        + '<option value="error" data-i18n="syncError">' + HubLang.t('syncError') + '</option>'
        + '<option value="syncing" data-i18n="syncing">' + HubLang.t('syncing') + '</option>'
        + '<option value="none" data-i18n="noSync">' + HubLang.t('noSync') + '</option>'
        + '</select>'
        + '</div></div>'

        + '<div class="layui-inline">'
        + '<button type="button" class="layui-btn" lay-submit lay-filter="ss_doSearch">'
        + '<i class="hi hi-magnifying-glass"></i> '
        + '<span data-i18n="search">' + HubLang.t('search') + '</span>'
        + '</button></div>'

        + '<div class="layui-inline">'
        + '<button type="reset" class="layui-btn layui-btn-primary" id="ss_btnReset">'
        + '<i class="hi hi-arrows-rotate"></i> '
        + '<span data-i18n="reset">' + HubLang.t('reset') + '</span>'
        + '</button></div>'

        + '</form>'
        + '</div></fieldset></div>'

        // ── Table Body ──
        + '<div class="layui-card-body"><table id="ss_syncTable" lay-filter="ss_syncTable"></table></div>'
        + '</div></div></div>';
    },

    init: function (container) {
      var treeTable = layui.treeTable;
      var form = layui.form;
      var layer = layui.layer;
      var $ = layui.$;

      _allTreeData = [];

      var toolbarHtml = '<div class="layui-btn-group">'
        + '<button class="layui-btn layui-btn-xs layui-btn-normal" lay-event="syncNow">'
        + '<i class="hi hi-arrows-rotate"></i> ' + HubLang.t('syncNow') + '</button>'
        + '<button class="layui-btn layui-btn-xs layui-btn-danger" lay-event="clearCache">'
        + '<i class="hi hi-trash-can"></i> ' + HubLang.t('clearCache') + '</button>'
        + '</div><span id="ss_syncingIndicator"></span>';

      function loadStats() {
        HubAPI.adminGet('sync/status').then(function (res) {
          if (res.code !== 0) return;
          var d = res.data;
          var el;
          el = container.querySelector('#ss_statEntries');
          if (el) el.textContent = d.totalEntries || 0;
          el = container.querySelector('#ss_statRows');
          if (el) el.textContent = (d.totalRows || 0).toLocaleString();
          el = container.querySelector('#ss_statLocked');
          if (el) el.textContent = d.lockedDays || 0;
          el = container.querySelector('#ss_statLastSync');
          if (el) el.textContent = d.lastSyncTime || '\u2014';

          var ind = container.querySelector('#ss_syncingIndicator');
          if (ind) {
            if (d.syncing) {
              ind.innerHTML = '<span class="layui-btn layui-btn-xs" style="background:#1e9fff;border-color:#1e9fff;cursor:default;">'
                + '<i class="hi hi-spinner"></i> '
                + HubLang.t('syncRunning') + '</span>';
            } else {
              ind.innerHTML = '';
            }
          }

          if (d.cacheableEndpoints && d.cacheableEndpoints.length > 0) {
            var sel = $(container).find('#ss_filterEndpoint');
            if (sel.find('option').length <= 1) {
              d.cacheableEndpoints.forEach(function (ep) {
                sel.append('<option value="' + ep + '">' + ep + '</option>');
              });
              form.render('select');
            }
          }
        }).catch(function () {});
      }

      function loadAgentFilter() {
        HubAPI.adminGet('agents').then(function (res) {
          if (res.code !== 0 || !res.data) return;
          var sel = $(container).find('#ss_filterAgent');
          res.data.forEach(function (a) {
            sel.append('<option value="' + a.id + '">' + a.label + '</option>');
          });
          form.render('select');
        }).catch(function () {});
      }

      function filterTree(data, filters) {
        if (!filters || (!filters.agent_id && !filters.endpoint && !filters.status)) {
          return JSON.parse(JSON.stringify(data));
        }
        var result = [];
        data.forEach(function (agent) {
          if (filters.agent_id && String(agent.id) !== String(filters.agent_id)) return;
          var children = agent.children || [];
          if (filters.endpoint || filters.status) {
            children = children.filter(function (c) {
              if (filters.endpoint && c.name !== filters.endpoint) return false;
              if (filters.status && c.sync_status !== filters.status) return false;
              return true;
            });
            if (children.length === 0) return;
          }
          var cloned = {};
          for (var k in agent) { if (agent.hasOwnProperty(k)) cloned[k] = agent[k]; }
          cloned.children = children;
          cloned.row_count = children.reduce(function (s, c) { return s + c.row_count; }, 0);
          cloned.synced_count = children.filter(function (c) { return c.sync_status === 'success'; }).length;
          cloned.total_endpoints = children.length;
          cloned.progress = children.length > 0 ? Math.round((cloned.synced_count / children.length) * 100) : 0;
          result.push(cloned);
        });
        return result;
      }

      function renderTree(data) {
        treeTable.render({
          elem: '#ss_syncTable',
          toolbar: toolbarHtml,
          defaultToolbar: ['filter'],
          data: data,
          tree: {
            customName: { children: 'children', name: 'name', id: 'id' },
            view: { showIcon: false, expandAllDefault: false }
          },
          cols: [[
            { type: 'checkbox', width: 50 },
            { field: 'name', title: HubLang.t('agent') + ' / Endpoint', width: 200, templet: function (d) {
              if (d.is_parent) {
                var dot = d.agent_status === 1
                  ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#16b777;margin-right:6px;vertical-align:middle;"></span>'
                  : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff5722;margin-right:6px;vertical-align:middle;"></span>';
                return dot + '<b>' + d.name + '</b>';
              }
              return '<span style="color:#1e9fff;">' + d.name + '</span>';
            }},
            { field: 'sync_status', title: HubLang.t('status'), width: 130, templet: function (d) {
              if (d.is_parent) {
                return d.agent_status === 1
                  ? '<span class="status-active">' + HubLang.t('active') + '</span>'
                  : '<span class="status-inactive">' + HubLang.t('locked') + '</span>';
              }
              if (d.sync_status === 'success') return '<span style="color:#16b777;font-weight:600;">' + HubLang.t('syncSuccess') + '</span>';
              if (d.sync_status === 'error') return '<span style="color:#ff5722;font-weight:600;">' + HubLang.t('syncError') + '</span>';
              if (d.sync_status === 'syncing') return '<span style="color:#1e9fff;font-weight:600;">' + HubLang.t('syncing') + '</span>';
              if (d.sync_status === 'none') return '<span style="color:#666;">' + HubLang.t('noSync') + '</span>';
              return '<span style="color:#999;">' + HubLang.t('syncPending') + '</span>';
            }},
            { field: 'progress', title: HubLang.t('syncProgress'), width: 150, templet: function (d) {
              if (!d.is_parent) return '\u2014';
              var pct = d.progress || 0;
              var color = pct >= 100 ? '#16b777' : pct >= 50 ? '#ffb800' : '#ff5722';
              return '<div style="display:flex;align-items:center;gap:8px;">'
                + '<div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">'
                + '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:3px;transition:width .3s;"></div></div>'
                + '<span style="font-size:12px;color:' + color + ';font-weight:600;white-space:nowrap;">'
                + d.synced_count + '/' + d.total_endpoints + '</span></div>';
            }},
            { field: 'row_count', title: HubLang.t('rowCount'), width: 110, templet: function (d) {
              if (d.is_parent) return '<b>' + (d.row_count || 0).toLocaleString() + '</b>';
              return d.row_count > 0 ? d.row_count.toLocaleString() : '<span style="color:#666;">0</span>';
            }},
            { field: 'date_count', title: HubLang.t('dateCount'), width: 100, templet: function (d) {
              if (d.is_parent) return '<b>' + (d.date_count || 0) + '</b>';
              return d.date_count > 0 ? String(d.date_count) : '<span style="color:#666;">0</span>';
            }},
            { field: 'locked_count', title: HubLang.t('lockedDays'), width: 100, templet: function (d) {
              if (d.is_parent) return '<b>' + (d.locked_count || 0) + '</b>';
              if (d.locked_count > 0) return '<span style="color:#ffb800;"><i class="hi hi-lock" style="font-size:14px;"></i> ' + d.locked_count + '</span>';
              return '<span style="color:#666;">0</span>';
            }},
            { field: 'last_sync', title: HubLang.t('lastSyncTime'), width: 170 },
            { field: 'error_msg', title: HubLang.t('errorCol'), minWidth: 200, templet: function (d) {
              if (!d.error_msg) return '\u2014';
              var short = d.error_msg.length > 40 ? d.error_msg.substring(0, 40) + '...' : d.error_msg;
              return '<span style="color:#ff5722;" title="' + d.error_msg.replace(/"/g, '&quot;') + '">' + short + '</span>';
            }}
          ]],
          done: function () {
            HubLang.applyDOM(container);
          }
        });
      }

      function loadTree() {
        HubAPI.adminGet('sync/tree').then(function (res) {
          if (res.code !== 0) return;
          _allTreeData = res.data || [];
          renderTree(_allTreeData);
        }).catch(function () {});
      }

      loadStats();
      loadAgentFilter();
      loadTree();

      form.on('submit(ss_doSearch)', function (data) {
        var filters = {};
        if (data.field.agent_id) filters.agent_id = data.field.agent_id;
        if (data.field.endpoint) filters.endpoint = data.field.endpoint;
        if (data.field.status) filters.status = data.field.status;
        renderTree(filterTree(_allTreeData, filters));
        return false;
      });

      var btnReset = container.querySelector('#ss_btnReset');
      if (btnReset) {
        btnReset.addEventListener('click', function () {
          setTimeout(function () {
            form.render('select', 'ss_searchForm');
            renderTree(_allTreeData);
          }, 50);
        });
      }

      treeTable.on('toolbar(ss_syncTable)', function (obj) {
        if (obj.event === 'syncNow') {
          layer.confirm(HubLang.t('confirmSync'), { icon: 3 }, function (idx) {
            layer.close(idx);
            var loadIdx = layer.load(2, { shade: [0.3, '#000'] });
            HubAPI.adminRequest('sync/run', 'POST', {}).then(function (res) {
              layer.close(loadIdx);
              if (res.code === 0) {
                layer.msg(HubLang.t('syncStarted'), { icon: 1 });
                setTimeout(function () { loadStats(); loadTree(); }, 3000);
                setTimeout(function () { loadStats(); loadTree(); }, 10000);
                setTimeout(function () { loadStats(); loadTree(); }, 30000);
              } else {
                layer.msg(res.msg || HubLang.t('error'), { icon: 2 });
              }
            }).catch(function () {
              layer.close(loadIdx);
              layer.msg(HubLang.t('connectionError'), { icon: 2 });
            });
          });
        } else if (obj.event === 'clearCache') {
          var checked = treeTable.checkStatus('ss_syncTable');
          var selectedIds = [];
          if (checked && checked.data) {
            checked.data.forEach(function (row) {
              if (row.is_parent && row.id) selectedIds.push(row.id);
            });
          }
          if (selectedIds.length === 0) {
            layer.msg(HubLang.t('noSelection') || 'Chưa chọn tài khoản nào', { icon: 0 });
            return;
          }
          layer.confirm(HubLang.t('confirmClearCache'), { icon: 3 }, function (idx) {
            layer.close(idx);
            var loadIdx = layer.load();
            HubAPI.adminRequest('sync/clear', 'POST', { agent_ids: selectedIds }).then(function (res) {
              layer.close(loadIdx);
              if (res.code === 0) {
                layer.msg(HubLang.t('cacheCleared'), { icon: 1 });
                loadStats();
                loadTree();
              } else {
                layer.msg(res.msg || HubLang.t('error'), { icon: 2 });
              }
            }).catch(function () {
              layer.close(loadIdx);
              layer.msg(HubLang.t('connectionError'), { icon: 2 });
            });
          });
        }
      });

      _interval = setInterval(function () { loadStats(); }, 30000);
    },

    destroy: function () {
      if (_interval) { clearInterval(_interval); _interval = null; }
    },

    onLangChange: function (container) {
      if (_interval) { clearInterval(_interval); _interval = null; }
      container.innerHTML = this.getHTML();
      HubLang.applyDOM(container);
      this.init(container);
    }
  };
})();
