(function () {
  var _interval = null;
  var _currentFilters = {};

  SpaPages.syncStatus = {
    getHTML: function () {
      return ''
        // ── Stat Cards ──
        + '<div id="ss_statsArea" style="display:flex;gap:15px;padding:0 0 15px;flex-wrap:wrap;">'
        + '<div style="flex:1;min-width:150px;background:rgba(255,255,255,0.05);border-radius:4px;padding:15px 20px;">'
        + '<div style="font-size:13px;color:#999;margin-bottom:6px;" data-i18n="totalCached">Tổng bản ghi</div>'
        + '<div style="font-size:22px;font-weight:600;color:#1e9fff;" id="ss_statEntries">—</div></div>'
        + '<div style="flex:1;min-width:150px;background:rgba(255,255,255,0.05);border-radius:4px;padding:15px 20px;">'
        + '<div style="font-size:13px;color:#999;margin-bottom:6px;" data-i18n="totalRows">Tổng dòng dữ liệu</div>'
        + '<div style="font-size:22px;font-weight:600;color:#16b777;" id="ss_statRows">—</div></div>'
        + '<div style="flex:1;min-width:150px;background:rgba(255,255,255,0.05);border-radius:4px;padding:15px 20px;">'
        + '<div style="font-size:13px;color:#999;margin-bottom:6px;" data-i18n="lockedDays">Ngày đã khoá</div>'
        + '<div style="font-size:22px;font-weight:600;color:#ffb800;" id="ss_statLocked">—</div></div>'
        + '<div style="flex:1;min-width:150px;background:rgba(255,255,255,0.05);border-radius:4px;padding:15px 20px;">'
        + '<div style="font-size:13px;color:#999;margin-bottom:6px;" data-i18n="lastSyncTime">Đồng bộ lần cuối</div>'
        + '<div style="font-size:14px;font-weight:600;color:#ccc;" id="ss_statLastSync">—</div></div>'
        + '</div>'
        // ── Sync Logs ──
        + '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-card-header"><fieldset class="layui-elem-field layui-field-title">'
        + '<legend data-i18n="syncLogs">Lịch sử đồng bộ</legend>'
        + '</fieldset>'
        // Filters
        + '<form class="layui-form layui-form-sm" lay-filter="ss_searchForm" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;">'
        + '<select name="agent_id" id="ss_filterAgent" lay-filter="ss_filterAgent" style="width:150px;">'
        + '<option value="" data-i18n="filterAgent">Lọc agent</option>'
        + '</select>'
        + '<select name="endpoint" id="ss_filterEndpoint" lay-filter="ss_filterEndpoint" style="width:160px;">'
        + '<option value="" data-i18n="filterEndpoint">Lọc endpoint</option>'
        + '</select>'
        + '<select name="status" lay-filter="ss_filterStatus" style="width:130px;">'
        + '<option value="" data-i18n="filterStatus">Lọc trạng thái</option>'
        + '<option value="success" data-i18n="syncSuccess">Thành công</option>'
        + '<option value="error" data-i18n="syncError">Lỗi</option>'
        + '<option value="syncing" data-i18n="syncing">Đang đồng bộ</option>'
        + '<option value="pending" data-i18n="syncPending">Chờ</option>'
        + '</select>'
        + '<button type="button" class="layui-btn layui-btn-xs" lay-submit lay-filter="ss_doSearch">'
        + '<i class="layui-icon layui-icon-search"></i> <span data-i18n="search">Tìm kiếm</span></button>'
        + '<button type="reset" class="layui-btn layui-btn-xs layui-btn-primary">'
        + '<span data-i18n="reset">Đặt lại</span></button>'
        + '</form>'
        + '</div>'
        + '<div class="layui-card-body"><table id="ss_syncTable" lay-filter="ss_syncTable"></table></div>'
        + '</div></div></div>';
    },

    init: function (container) {
      var table = layui.table;
      var form = layui.form;
      var layer = layui.layer;
      var $ = layui.$;

      _currentFilters = {};

      // Toolbar HTML (inline)
      var toolbarHtml = '<div class="layui-btn-group">'
        + '<button class="layui-btn layui-btn-xs layui-btn-normal" lay-event="syncNow">'
        + '<i class="layui-icon layui-icon-refresh"></i> ' + HubLang.t('syncNow') + '</button>'
        + '<button class="layui-btn layui-btn-xs layui-btn-danger" lay-event="clearCache">'
        + '<i class="layui-icon layui-icon-delete"></i> ' + HubLang.t('clearCache') + '</button>'
        + '</div><span id="ss_syncingIndicator"></span>';

      // ── Load Stats ──
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
          if (el) el.textContent = d.lastSyncTime || '—';

          // Syncing indicator
          var ind = container.querySelector('#ss_syncingIndicator');
          if (ind) {
            if (d.syncing) {
              ind.innerHTML = '<span class="layui-btn layui-btn-xs" style="background:#1e9fff;border-color:#1e9fff;cursor:default;">'
                + '<i class="layui-icon layui-icon-loading layui-anim layui-anim-rotate layui-anim-loop"></i> '
                + HubLang.t('syncRunning') + '</span>';
            } else {
              ind.innerHTML = '';
            }
          }

          // Populate endpoint filter (once)
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

      // ── Load Agent Filter ──
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

      // ── Load Sync Logs ──
      function loadLogs(filters) {
        filters = filters || {};
        var params = Object.assign({ page: 1, limit: 20 }, filters);
        var qs = Object.keys(params)
          .filter(function (k) { return params[k] !== undefined && params[k] !== ''; })
          .map(function (k) { return k + '=' + encodeURIComponent(params[k]); })
          .join('&');

        table.render({
          elem: '#ss_syncTable',
          toolbar: toolbarHtml,
          defaultToolbar: ['filter'],
          url: '/api/admin/sync/logs?' + qs,
          method: 'get',
          headers: { Authorization: 'Bearer ' + HubAPI.getToken() },
          page: true,
          limit: 20,
          text: { none: HubLang.t('noSyncData') },
          parseData: function (res) {
            return { code: res.code === 0 ? 0 : 1, msg: '', count: res.count || 0, data: res.data || [] };
          },
          cols: [[
            { field: 'id', title: 'ID', width: 60, sort: true },
            { field: 'agent_label', title: HubLang.t('agent'), width: 130 },
            { field: 'endpoint_key', title: HubLang.t('endpoint'), width: 150 },
            { field: 'date_str', title: HubLang.t('cachedDate'), width: 120 },
            { field: 'status', title: HubLang.t('status'), width: 110, templet: function (d) {
              if (d.status === 'success') return '<span style="color:#16b777;font-weight:600;">' + HubLang.t('syncSuccess') + '</span>';
              if (d.status === 'error') return '<span style="color:#ff5722;font-weight:600;">' + HubLang.t('syncError') + '</span>';
              if (d.status === 'syncing') return '<span style="color:#1e9fff;font-weight:600;">' + HubLang.t('syncing') + '</span>';
              return '<span style="color:#999;font-weight:600;">' + HubLang.t('syncPending') + '</span>';
            }},
            { field: 'row_count', title: HubLang.t('rowCount'), width: 90 },
            { field: 'started_at', title: HubLang.t('time'), width: 160 },
            { field: 'completed_at', title: HubLang.t('updateTime'), width: 160 },
            { field: 'error_msg', title: HubLang.t('errorCol'), minWidth: 200, templet: function (d) {
              if (d.error_msg) {
                var short = d.error_msg.length > 40 ? d.error_msg.substring(0, 40) + '...' : d.error_msg;
                return '<span style="color:#ff5722;" title="' + d.error_msg.replace(/"/g, '&quot;') + '">' + short + '</span>';
              }
              return '—';
            }}
          ]],
          done: function () {
            HubLang.applyDOM(container);
          }
        });
      }

      // ── Init ──
      loadStats();
      loadAgentFilter();
      loadLogs();

      // ── Search ──
      form.on('submit(ss_doSearch)', function (data) {
        _currentFilters = {};
        if (data.field.agent_id) _currentFilters.agent_id = data.field.agent_id;
        if (data.field.endpoint) _currentFilters.endpoint = data.field.endpoint;
        if (data.field.status) _currentFilters.status = data.field.status;
        loadLogs(_currentFilters);
        return false;
      });

      // ── Toolbar Events ──
      table.on('toolbar(ss_syncTable)', function (obj) {
        if (obj.event === 'syncNow') {
          layer.confirm(HubLang.t('confirmSync'), { icon: 3 }, function (idx) {
            layer.close(idx);
            var loadIdx = layer.load(2, { shade: [0.3, '#000'] });
            HubAPI.adminRequest('sync/run', 'POST', {}).then(function (res) {
              layer.close(loadIdx);
              if (res.code === 0) {
                layer.msg(HubLang.t('syncStarted'), { icon: 1 });
                setTimeout(function () { loadStats(); loadLogs(_currentFilters); }, 3000);
                setTimeout(function () { loadStats(); loadLogs(_currentFilters); }, 10000);
                setTimeout(function () { loadStats(); loadLogs(_currentFilters); }, 30000);
              } else {
                layer.msg(res.msg || HubLang.t('error'), { icon: 2 });
              }
            }).catch(function () {
              layer.close(loadIdx);
              layer.msg(HubLang.t('connectionError'), { icon: 2 });
            });
          });
        } else if (obj.event === 'clearCache') {
          layer.confirm(HubLang.t('confirmClearCache'), { icon: 3 }, function (idx) {
            layer.close(idx);
            var loadIdx = layer.load();
            HubAPI.adminRequest('sync/clear', 'POST', {}).then(function (res) {
              layer.close(loadIdx);
              if (res.code === 0) {
                layer.msg(HubLang.t('cacheCleared'), { icon: 1 });
                loadStats();
                loadLogs(_currentFilters);
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

      // Auto-refresh stats every 30s
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
