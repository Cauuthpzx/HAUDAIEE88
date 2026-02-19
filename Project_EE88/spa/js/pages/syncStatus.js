(function () {
  var _pollTimer = null;
  var _statsTimer = null;
  var _sse = null;
  var _sseRetryCount = 0;
  var MAX_SSE_RETRIES = 3;

  // Static endpoint list — phải KHỚP thứ tự server ALL_EPS
  var STATIC_EPS = [
    { key: 'members', name: 'Danh sách hội viên', isDate: false },
    { key: 'invites', name: 'Mã mời', isDate: false },
    { key: 'bet-orders', name: 'Đơn cược bên thứ 3', isDate: false },
    { key: 'deposits', name: 'Nạp / Rút tiền', isDate: true },
    { key: 'withdrawals', name: 'Lịch sử rút tiền', isDate: true },
    { key: 'lottery-bets', name: 'Đơn cược xổ số', isDate: true },
    { key: 'report-lottery', name: 'Báo cáo xổ số', isDate: true },
    { key: 'report-funds', name: 'Sao kê giao dịch', isDate: true },
    { key: 'report-third', name: 'Báo cáo nhà cung cấp game', isDate: true }
  ];

  SpaPages.syncStatus = {
    getHTML: function () {
      var epOptions = '';
      STATIC_EPS.forEach(function (ep) {
        epOptions += '<option value="' + ep.key + '">' + ep.name + '</option>';
      });

      return (
        '<style>' +
        '.page-info { font-size: 11px; color: #1e9fff; margin-left: 4px; }' +
        '.error-text { font-size: 11px; color: #ff5722; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }' +
        '@keyframes spin { to { transform: rotate(360deg); } }' +
        '.syncing-spin { display: inline-block; animation: spin 1s linear infinite; }' +
        '</style>' +
        '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">' +
        '<div class="layui-card-header">' +
        '<fieldset class="layui-elem-field layui-field-title">' +
        '<legend data-i18n="syncStatus">' +
        HubLang.t('syncStatus') +
        '</legend>' +
        '<div class="layui-field-box">' +
        // ── Stat Cards ──
        '<div id="ss_statsArea" style="display:flex;gap:15px;margin-bottom:15px;flex-wrap:wrap;">' +
        '<div style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 18px;">' +
        '<div style="font-size:12px;color:#999;margin-bottom:4px;">' +
        HubLang.t('totalAgents') +
        '</div>' +
        '<div style="font-size:22px;font-weight:600;color:#1e9fff;" id="ss_totalAgents">\u2014</div></div>' +
        '<div style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 18px;">' +
        '<div style="font-size:12px;color:#999;margin-bottom:4px;">' +
        HubLang.t('active') +
        '</div>' +
        '<div style="font-size:22px;font-weight:600;color:#16b777;" id="ss_activeAgents">\u2014</div></div>' +
        '<div style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 18px;">' +
        '<div style="font-size:12px;color:#999;margin-bottom:4px;">' +
        HubLang.t('fullySynced') +
        '</div>' +
        '<div style="font-size:22px;font-weight:600;color:#ffb800;" id="ss_fullySynced">\u2014</div></div>' +
        '<div style="flex:1;min-width:140px;background:rgba(255,255,255,0.05);border-radius:4px;padding:12px 18px;">' +
        '<div style="font-size:12px;color:#999;margin-bottom:4px;">' +
        HubLang.t('status') +
        '</div>' +
        '<div style="font-size:22px;font-weight:600;color:#999;" id="ss_syncState">\u2014</div></div>' +
        '</div>' +
        // ── Filters ──
        '<form class="layui-form" lay-filter="ss_searchForm">' +
        '<div class="layui-inline"><div class="layui-input-inline" style="width:150px;">' +
        '<select name="agent_id" id="ss_filterAgent" lay-filter="ss_filterAgent">' +
        '<option value="">' +
        HubLang.t('all') +
        ' \u2014 ' +
        HubLang.t('agent') +
        '</option>' +
        '</select></div></div>' +
        '<div class="layui-inline"><div class="layui-input-inline" style="width:180px;">' +
        '<select name="endpoint" lay-filter="ss_filterEndpoint">' +
        '<option value="">' +
        HubLang.t('all') +
        ' \u2014 Endpoint</option>' +
        epOptions +
        '</select></div></div>' +
        '<div class="layui-inline"><div class="layui-input-inline" style="width:140px;">' +
        '<select name="status" lay-filter="ss_filterStatus">' +
        '<option value="">' +
        HubLang.t('all') +
        ' \u2014 ' +
        HubLang.t('status') +
        '</option>' +
        '<option value="done">' +
        HubLang.t('completed') +
        '</option>' +
        '<option value="syncing">' +
        HubLang.t('syncing') +
        '</option>' +
        '<option value="idle">' +
        HubLang.t('notSynced') +
        '</option>' +
        '<option value="error">' +
        HubLang.t('error') +
        '</option>' +
        '</select></div></div>' +
        '<div class="layui-inline">' +
        '<button type="button" class="layui-btn layui-btn-sm" lay-submit lay-filter="ss_doSearch">' +
        '<i class="hi hi-magnifying-glass"></i> ' +
        HubLang.t('search') +
        '</button></div>' +
        '<div class="layui-inline">' +
        '<button type="reset" class="layui-btn layui-btn-sm layui-btn-primary" id="ss_btnReset">' +
        HubLang.t('reset') +
        '</button></div>' +
        '</form>' +
        '</div></fieldset></div>' +
        // ── TreeTable ──
        '<div class="layui-card-body">' +
        '<table class="layui-hide" id="ss_syncTree" lay-filter="ss_syncTree"></table>' +
        '</div>' +
        '</div></div></div>'
      );
    },

    init: function (container) {
      var treeTable = layui.treeTable;
      var form = layui.form;
      var layer = layui.layer;
      var $ = layui.$;

      var _agents = [];
      var _snap = null;
      var _rendered = false;
      var _currentFilter = {};
      var _totalDays = 65;

      // ═══════════════════════════════════════
      // ── Helpers ──
      // ═══════════════════════════════════════

      function fmtElapsed(ms) {
        var s = Math.round(ms / 1000);
        if (s < 60) return s + 's';
        return Math.floor(s / 60) + 'm' + String(s % 60).padStart(2, '0') + 's';
      }

      function setNum(id, val) {
        var el = container.querySelector('#' + id);
        if (el) el.textContent = val;
      }

      // ═══════════════════════════════════════
      // ── Build tree data ──
      // ═══════════════════════════════════════

      function buildTreeData() {
        var snapMap = {};
        if (_snap && _snap.agents) {
          _snap.agents.forEach(function (a) {
            snapMap[a.agentId] = a;
          });
        }

        return _agents.map(function (a) {
          var pa = snapMap[a.id];
          // Dùng progress data khi CÓ (syncing/done/error) — không chỉ khi syncing
          var hasProgress = pa && pa.endpoints && pa.endpoints.length > 0;
          var isSyncing = pa && pa.status === 'syncing';

          var node = {
            id: a.id,
            name: a.label,
            isAgent: true,
            agentId: a.id,
            lockedDays: a.lockedDays || 0,
            lastSyncAt: a.lastSyncAt || null,
            agentStatus: a.status,
            syncing: isSyncing,
            syncStatus: pa ? pa.status : null,
            elapsed:
              isSyncing || (pa && pa.status === 'done') ? pa.elapsed || 0 : 0
          };

          if (hasProgress) {
            // Real-time data từ progress snapshot
            node.children = pa.endpoints.map(function (ep, idx) {
              return {
                id: a.id * 1000 + idx + 1,
                name: ep.name || ep.key,
                epKey: ep.key,
                isAgent: false,
                total: ep.total,
                completed: ep.completed,
                dataRows: ep.rows || 0,
                epStatus: ep.status,
                currentPage: ep.currentPage || 0,
                totalPages: ep.totalPages || 0,
                error: ep.error || null
              };
            });
          } else {
            // Static data từ /status (hiện rows từ DB cho TẤT CẢ endpoints)
            var agentRows = a.rows || {};
            node.children = STATIC_EPS.map(function (ep, idx) {
              var total, completed, rows, status;
              rows = agentRows[ep.key] || 0;

              if (ep.isDate) {
                total = _totalDays;
                completed = a.lockedDays || 0;
                status = (a.lockedDays || 0) >= _totalDays ? 'done' : 'idle';
              } else {
                total = 1;
                completed = rows > 0 ? 1 : 0;
                status = rows > 0 ? 'done' : 'idle';
              }
              return {
                id: a.id * 1000 + idx + 1,
                name: ep.name,
                epKey: ep.key,
                isAgent: false,
                total: total,
                completed: completed,
                dataRows: rows,
                epStatus: status,
                currentPage: 0,
                totalPages: 0,
                error: null
              };
            });
          }

          return node;
        });
      }

      // ═══════════════════════════════════════
      // ── Filter tree data ──
      // ═══════════════════════════════════════

      function filterTreeData(data) {
        if (
          !_currentFilter.agent_id &&
          !_currentFilter.endpoint &&
          !_currentFilter.status
        ) {
          return data;
        }
        var result = [];
        data.forEach(function (agent) {
          if (
            _currentFilter.agent_id &&
            String(agent.id) !== String(_currentFilter.agent_id)
          )
            return;
          var children = agent.children || [];
          if (_currentFilter.endpoint || _currentFilter.status) {
            children = children.filter(function (c) {
              if (
                _currentFilter.endpoint &&
                c.epKey !== _currentFilter.endpoint
              )
                return false;
              if (_currentFilter.status && c.epStatus !== _currentFilter.status)
                return false;
              return true;
            });
            if (children.length === 0) return;
          }
          var cloned = {};
          for (var k in agent) {
            if (agent.hasOwnProperty(k)) cloned[k] = agent[k];
          }
          cloned.children = children;
          result.push(cloned);
        });
        return result;
      }

      // ═══════════════════════════════════════
      // ── Toolbars ──
      // ═══════════════════════════════════════

      var barToolbarHtml =
        '<div class="layui-btn-group">' +
        '<button class="layui-btn layui-btn-xs layui-btn-normal" lay-event="syncAll">' +
        '<i class="hi hi-arrows-rotate"></i> ' +
        HubLang.t('syncNow') +
        '</button>' +
        '<button class="layui-btn layui-btn-xs layui-btn-danger" lay-event="clearSelected">' +
        '<i class="hi hi-trash-can"></i> ' +
        HubLang.t('clearCache') +
        '</button>' +
        '</div><span id="ss_syncingIndicator"></span>';

      if (!document.getElementById('ss_toolbarTpl')) {
        var tpl = document.createElement('script');
        tpl.type = 'text/html';
        tpl.id = 'ss_toolbarTpl';
        tpl.innerHTML =
          '{{# if(d.isAgent){ }}' +
          '<div class="layui-btn-group">' +
          '<button class="layui-btn layui-btn-xs layui-btn-normal" lay-event="sync"><i class="hi hi-arrows-rotate"></i> ' +
          HubLang.t('syncNow') +
          '</button>' +
          '<button class="layui-btn layui-btn-xs layui-btn-danger" lay-event="clear"><i class="hi hi-trash-can"></i> ' +
          HubLang.t('clearCache') +
          '</button>' +
          '</div>' +
          '{{# } }}';
        document.body.appendChild(tpl);
      }

      // ═══════════════════════════════════════
      // ── Render tree ──
      // ═══════════════════════════════════════

      function renderTree() {
        var data = filterTreeData(buildTreeData());
        if (!_rendered) {
          treeTable.render({
            id: 'ss_syncTree',
            elem: '#ss_syncTree',
            toolbar: barToolbarHtml,
            defaultToolbar: ['filter'],
            data: data,
            tree: {
              customName: { children: 'children' },
              view: { showIcon: false }
            },
            size: 'sm',
            even: true,
            cols: [
              [
                { type: 'checkbox', width: 50 },
                {
                  field: 'name',
                  title: HubLang.t('agent') + ' / Endpoint',
                  minWidth: 150,
                  templet: function (d) {
                    if (d.isAgent) {
                      var c = d.agentStatus === 1 ? '#16b777' : '#ff5722';
                      var syncIcon = d.syncing
                        ? ' <i class="hi hi-arrows-rotate syncing-spin" style="font-size:12px;color:#1e9fff;"></i>'
                        : '';
                      return (
                        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' +
                        c +
                        ';margin-right:6px;vertical-align:middle;"></span><b>' +
                        d.name +
                        '</b>' +
                        syncIcon
                      );
                    }
                    return '<span style="color:#1e9fff;">' + d.name + '</span>';
                  }
                },
                {
                  title: HubLang.t('status'),
                  width: 100,
                  align: 'center',
                  templet: function (d) {
                    if (d.isAgent) {
                      if (d.syncing)
                        return (
                          '<span style="color:#1e9fff;font-weight:600;">' +
                          HubLang.t('syncing') +
                          '</span>'
                        );
                      if (d.syncStatus === 'done')
                        return (
                          '<span style="color:#16b777;font-weight:600;">' +
                          HubLang.t('completed') +
                          '</span>'
                        );
                      if (d.syncStatus === 'error')
                        return (
                          '<span style="color:#ff5722;font-weight:600;">' +
                          HubLang.t('error') +
                          '</span>'
                        );
                      return d.agentStatus === 1
                        ? '<span style="color:#16b777;font-weight:600;">' +
                            HubLang.t('active') +
                            '</span>'
                        : '<span style="color:#ff5722;font-weight:600;">' +
                            HubLang.t('locked') +
                            '</span>';
                    }
                    if (d.epStatus === 'done')
                      return (
                        '<span style="color:#16b777;font-weight:600;">' +
                        HubLang.t('completed') +
                        '</span>'
                      );
                    if (d.epStatus === 'error')
                      return (
                        '<span style="color:#ff5722;font-weight:600;">' +
                        HubLang.t('error') +
                        '</span>'
                      );
                    if (d.epStatus === 'syncing')
                      return (
                        '<span style="color:#1e9fff;font-weight:600;">' +
                        HubLang.t('syncing') +
                        '</span>'
                      );
                    if (d.epStatus === 'pending')
                      return (
                        '<span style="color:#999;">' +
                        HubLang.t('pending') +
                        '</span>'
                      );
                    return '<span style="color:#666;">\u2014</span>';
                  }
                },
                {
                  title: HubLang.t('syncProgress'),
                  minWidth: 160,
                  templet: function (d) {
                    var completed, total, color;
                    if (d.isAgent) {
                      if (d.syncing && d.children) {
                        completed = 0;
                        total = 0;
                        for (var ci = 0; ci < d.children.length; ci++) {
                          completed += d.children[ci].completed || 0;
                          total += d.children[ci].total || 0;
                        }
                      } else {
                        completed = d.lockedDays;
                        total = _totalDays;
                      }
                    } else {
                      completed = d.completed || 0;
                      total = d.total || 0;
                    }
                    var pct =
                      total > 0 ? Math.round((completed / total) * 100) : 0;
                    if (pct > 100) pct = 100;
                    if (d.isAgent) {
                      color =
                        pct >= 100
                          ? '#16b777'
                          : pct >= 50
                            ? '#ffb800'
                            : '#ff5722';
                    } else {
                      color =
                        d.epStatus === 'done'
                          ? '#16b777'
                          : d.epStatus === 'error'
                            ? '#ff5722'
                            : d.epStatus === 'idle'
                              ? '#999'
                              : '#1e9fff';
                    }

                    var html =
                      '<div style="display:flex;align-items:center;gap:8px;">' +
                      '<div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">' +
                      '<div style="width:' +
                      pct +
                      '%;height:100%;background:' +
                      color +
                      ';border-radius:3px;transition:width .3s;"></div></div>' +
                      '<span style="font-size:12px;color:' +
                      color +
                      ';font-weight:600;white-space:nowrap;">' +
                      completed +
                      '/' +
                      total +
                      '</span>';

                    // Page progress cho multi-page endpoints
                    if (
                      !d.isAgent &&
                      d.totalPages > 1 &&
                      d.epStatus === 'syncing'
                    ) {
                      html +=
                        '<span class="page-info">p' +
                        d.currentPage +
                        '/' +
                        d.totalPages +
                        '</span>';
                    }

                    html += '</div>';

                    // Error message
                    if (!d.isAgent && d.error) {
                      html +=
                        '<div class="error-text" title="' +
                        d.error.replace(/"/g, '&quot;') +
                        '">' +
                        d.error +
                        '</div>';
                    }

                    return html;
                  }
                },
                {
                  title: HubLang.t('rowCount'),
                  width: 90,
                  align: 'right',
                  templet: function (d) {
                    if (d.isAgent) {
                      var totalRows = 0;
                      if (d.children) {
                        for (var i = 0; i < d.children.length; i++) {
                          totalRows += d.children[i].dataRows || 0;
                        }
                      }
                      return totalRows > 0
                        ? '<span style="font-weight:600;color:#1e9fff;">' +
                            totalRows.toLocaleString() +
                            '</span>'
                        : '<span style="color:#666;">\u2014</span>';
                    }
                    return d.dataRows > 0
                      ? '<span style="font-weight:600;">' +
                          d.dataRows.toLocaleString() +
                          '</span>'
                      : '<span style="color:#666;">\u2014</span>';
                  }
                },
                {
                  title: HubLang.t('lockedDays'),
                  width: 80,
                  align: 'center',
                  templet: function (d) {
                    if (d.isAgent) {
                      var ld = d.lockedDays || 0;
                      if (ld > 0)
                        return (
                          '<span style="color:#ffb800;"><i class="hi hi-lock" style="font-size:14px;"></i> ' +
                          ld +
                          '</span>'
                        );
                      return '<span style="color:#666;">0</span>';
                    }
                    return '';
                  }
                },
                {
                  title: HubLang.t('elapsed'),
                  width: 130,
                  align: 'center',
                  templet: function (d) {
                    if (!d.isAgent) return '';
                    if (d.syncing && d.elapsed) {
                      return (
                        '<span style="font-size:12px;color:#1e9fff;"><i class="hi hi-arrows-rotate syncing-spin" style="font-size:11px;"></i> ' +
                        fmtElapsed(d.elapsed) +
                        '</span>'
                      );
                    }
                    if (d.lastSyncAt) {
                      var t = d.lastSyncAt.replace('T', ' ').substring(0, 16);
                      return (
                        '<span style="font-size:11px;color:#999;">' +
                        t +
                        '</span>'
                      );
                    }
                    return '<span style="color:#666;">\u2014</span>';
                  }
                },
                {
                  title: HubLang.t('actions'),
                  width: 160,
                  align: 'center',
                  toolbar: '#ss_toolbarTpl'
                }
              ]
            ],
            done: function () {
              HubLang.applyDOM(container);
            }
          });
          _rendered = true;
        } else {
          treeTable.reloadData('ss_syncTree', { data: data });
        }
      }

      // ═══════════════════════════════════════
      // ── SSE Real-time Progress ──
      // ═══════════════════════════════════════

      function connectSSE() {
        if (_sse) return;
        var token = HubAPI.getToken();
        if (!token) return;

        stopPolling();

        _sse = new EventSource(
          '/api/admin/sync/progress?token=' + encodeURIComponent(token)
        );

        _sse.onmessage = function (event) {
          try {
            // Reset retry count khi nhận được message thành công
            _sseRetryCount = 0;
            var data = JSON.parse(event.data);
            handleProgressData(data);
          } catch (e) {}
        };

        _sse.onerror = function () {
          disconnectSSE();
          _sseRetryCount++;
          if (_sseRetryCount <= MAX_SSE_RETRIES) {
            setTimeout(connectSSE, 3000);
          } else {
            startPolling();
          }
        };
      }

      function disconnectSSE() {
        if (_sse) {
          _sse.close();
          _sse = null;
        }
      }

      // ═══════════════════════════════════════
      // ── Polling Fallback ──
      // ═══════════════════════════════════════

      function startPolling() {
        if (_pollTimer || _sse) return;
        _pollTimer = setInterval(function () {
          HubAPI.adminGet('sync/progress-data')
            .then(function (res) {
              if (res.code === 0 && res.data) handleProgressData(res.data);
            })
            .catch(function () {});
        }, 2000);
      }

      function stopPolling() {
        if (_pollTimer) {
          clearInterval(_pollTimer);
          _pollTimer = null;
        }
      }

      // ═══════════════════════════════════════
      // ── Handle progress data ──
      // ═══════════════════════════════════════

      function handleProgressData(data) {
        if (data.agents && data.agents.length > 0) {
          _snap = data;
          var stillSyncing = data.agents.some(function (a) {
            return a.status === 'syncing';
          });
          updateSyncState(stillSyncing);
          renderTree();
        } else {
          if (_snap) {
            _snap = null;
            loadAgents();
          }
          updateSyncState(false);
          disconnectSSE();
          stopPolling();
        }
      }

      function updateSyncState(isSyncing) {
        var stateEl = container.querySelector('#ss_syncState');
        if (stateEl) {
          stateEl.textContent = isSyncing
            ? HubLang.t('syncing')
            : HubLang.t('ready');
          stateEl.style.color = isSyncing ? '#ff4d4f' : '#16b777';
        }
        var ind = container.querySelector('#ss_syncingIndicator');
        if (ind) {
          ind.innerHTML = isSyncing
            ? '<span class="layui-btn layui-btn-xs" style="background:#1e9fff;border-color:#1e9fff;cursor:default;margin-left:10px;">' +
              '<i class="hi hi-arrows-rotate syncing-spin"></i> ' +
              HubLang.t('syncRunning') +
              '</span>'
            : '';
        }
      }

      // ═══════════════════════════════════════
      // ── Data loading ──
      // ═══════════════════════════════════════

      function loadAgents() {
        HubAPI.adminGet('sync/status')
          .then(function (res) {
            if (res.code !== 0) return;
            var d = res.data;
            _agents = d.agents || [];
            _totalDays = d.totalDays || 65;

            // Stat cards
            var active = _agents.filter(function (a) {
              return a.status === 1;
            }).length;
            var full = _agents.filter(function (a) {
              return (a.lockedDays || 0) >= _totalDays;
            }).length;
            setNum('ss_totalAgents', _agents.length);
            setNum('ss_activeAgents', active);
            setNum('ss_fullySynced', full + '/' + _agents.length);

            // Nếu đang sync → kết nối SSE
            if (d.syncing) {
              connectSSE();
            }

            updateSyncState(d.syncing);
            renderTree();
          })
          .catch(function (err) {
            console.warn('loadAgents lỗi:', err.message);
          });
      }

      function loadAgentFilter() {
        HubAPI.adminGet('agents')
          .then(function (res) {
            if (res.code !== 0 || !res.data) return;
            var sel = $(container).find('#ss_filterAgent');
            res.data.forEach(function (a) {
              sel.append(
                '<option value="' + a.id + '">' + a.label + '</option>'
              );
            });
            form.render('select');
          })
          .catch(function () {});
      }

      // ═══════════════════════════════════════
      // ── Filter events ──
      // ═══════════════════════════════════════

      form.on('submit(ss_doSearch)', function (data) {
        _currentFilter = {};
        if (data.field.agent_id) _currentFilter.agent_id = data.field.agent_id;
        if (data.field.endpoint) _currentFilter.endpoint = data.field.endpoint;
        if (data.field.status) _currentFilter.status = data.field.status;
        renderTree();
        return false;
      });

      var btnReset = container.querySelector('#ss_btnReset');
      if (btnReset) {
        btnReset.addEventListener('click', function () {
          _currentFilter = {};
          setTimeout(function () {
            form.render('select', 'ss_searchForm');
            renderTree();
          }, 50);
        });
      }

      // ═══════════════════════════════════════
      // ── Toolbar events (table-level) ──
      // ═══════════════════════════════════════

      treeTable.on('toolbar(ss_syncTree)', function (obj) {
        if (obj.event === 'syncAll') {
          layer.confirm(HubLang.t('confirmSync'), { icon: 3 }, function (idx) {
            layer.close(idx);
            var loadIdx = layer.load(2, { shade: [0.3, '#000'] });
            HubAPI.adminRequest('sync/run-all', 'POST', {})
              .then(function (res) {
                layer.close(loadIdx);
                if (res.code === 0) {
                  layer.msg(HubLang.t('syncStarted'), { icon: 1 });
                  setTimeout(connectSSE, 500);
                } else {
                  layer.msg(res.msg || HubLang.t('error'), { icon: 2 });
                }
              })
              .catch(function () {
                layer.close(loadIdx);
                layer.msg(HubLang.t('connectionError'), { icon: 2 });
              });
          });
        } else if (obj.event === 'clearSelected') {
          var checked = treeTable.checkStatus('ss_syncTree');
          var selectedIds = [];
          if (checked && checked.data) {
            checked.data.forEach(function (row) {
              if (row.isAgent && row.id) selectedIds.push(row.id);
            });
          }
          if (selectedIds.length === 0) {
            layer.msg(HubLang.t('noSelection') || 'Chưa chọn tài khoản nào', {
              icon: 0
            });
            return;
          }
          layer.confirm(
            HubLang.t('confirmClearLocks') ||
              'Xoá khoá ngày của ' + selectedIds.length + ' đại lý đã chọn?',
            { icon: 3 },
            function (idx) {
              layer.close(idx);
              var loadIdx = layer.load();
              var promises = selectedIds.map(function (aid) {
                return HubAPI.adminRequest('sync/clear', 'POST', {
                  agent_id: aid
                });
              });
              Promise.all(promises)
                .then(function () {
                  layer.close(loadIdx);
                  layer.msg(HubLang.t('cacheCleared') || 'Đã xoá', { icon: 1 });
                  loadAgents();
                })
                .catch(function () {
                  layer.close(loadIdx);
                  layer.msg(HubLang.t('connectionError'), { icon: 2 });
                });
            }
          );
        }
      });

      // ═══════════════════════════════════════
      // ── Row tool events ──
      // ═══════════════════════════════════════

      treeTable.on('tool(ss_syncTree)', function (obj) {
        var d = obj.data;
        if (!d.isAgent) return;

        if (obj.event === 'sync') {
          layer.confirm(
            HubLang.t('confirmSync') + ' "' + d.name + '"?',
            { icon: 3 },
            function (idx) {
              layer.close(idx);
              HubAPI.adminRequest('sync/run', 'POST', { agent_id: d.agentId })
                .then(function (res) {
                  if (res.code === 0) {
                    layer.msg(HubLang.t('syncStarted'), { icon: 1 });
                    setTimeout(connectSSE, 500);
                  } else {
                    layer.msg(res.msg || HubLang.t('error'), { icon: 2 });
                  }
                })
                .catch(function () {
                  layer.msg(HubLang.t('connectionError'), { icon: 2 });
                });
            }
          );
        } else if (obj.event === 'clear') {
          layer.confirm(
            HubLang.t('confirmClearLocks') ||
              'Xoá tất cả khoá ngày của "' + d.name + '"?',
            { icon: 3 },
            function (idx) {
              layer.close(idx);
              HubAPI.adminRequest('sync/clear', 'POST', { agent_id: d.agentId })
                .then(function (res) {
                  if (res.code === 0) {
                    layer.msg(res.msg || HubLang.t('cacheCleared'), {
                      icon: 1
                    });
                    loadAgents();
                  } else {
                    layer.msg(res.msg || HubLang.t('error'), { icon: 2 });
                  }
                })
                .catch(function () {
                  layer.msg(HubLang.t('connectionError'), { icon: 2 });
                });
            }
          );
        }
      });

      // ── Init ──
      loadAgents();
      loadAgentFilter();
      _statsTimer = setInterval(loadAgents, 30000);
    },

    destroy: function () {
      if (_sse) {
        _sse.close();
        _sse = null;
      }
      if (_pollTimer) {
        clearInterval(_pollTimer);
        _pollTimer = null;
      }
      if (_statsTimer) {
        clearInterval(_statsTimer);
        _statsTimer = null;
      }
      _sseRetryCount = 0;
      var tpl = document.getElementById('ss_toolbarTpl');
      if (tpl) tpl.remove();
    },

    onLangChange: function (container) {
      this.destroy();
      container.innerHTML = this.getHTML();
      HubLang.applyDOM(container);
      this.init(container);
    }
  };
})();
