(function () {
  var _pollTimer = null;
  var _statsTimer = null;

  SpaPages.syncStatus = {
    getHTML: function () {
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-card-header">'
        + '<fieldset class="layui-elem-field layui-field-title">'
        + '<legend data-i18n="syncStatus">' + HubLang.t('syncStatus') + '</legend>'
        + '<div class="layui-field-box">'

        // ── Stat cards ──
        + '<div class="sync-stats">'
        + '<div class="ss-card"><div class="ss-num" id="ss_totalAgents" style="color:#1e9fff;">—</div><div class="ss-label">Tổng đại lý</div></div>'
        + '<div class="ss-card"><div class="ss-num" id="ss_activeAgents" style="color:#16b777;">—</div><div class="ss-label">Hoạt động</div></div>'
        + '<div class="ss-card"><div class="ss-num" id="ss_fullySynced" style="color:#ffb800;">—</div><div class="ss-label">Đã đồng bộ đủ</div></div>'
        + '<div class="ss-card"><div class="ss-num" id="ss_syncState" style="color:#999;">—</div><div class="ss-label">Trạng thái</div></div>'
        + '</div>'

        // ── Toolbar ──
        + '<div style="display:flex;align-items:center;gap:12px;margin-top:15px;flex-wrap:wrap;">'
        + '<button class="layui-btn layui-btn-sm layui-btn-normal" id="ss_btnSyncAll">'
        + '<i class="hi hi-arrows-rotate"></i> ' + HubLang.t('syncNow')
        + '</button>'
        + '</div>'

        + '</div></fieldset></div>'

        // ── TreeTable ──
        + '<div class="layui-card-body">'
        + '<table class="layui-hide" id="ss_syncTree" lay-filter="ss_syncTree"></table>'
        + '</div>'

        + '</div></div></div>';
    },

    init: function (container) {
      var treeTable = layui.treeTable;
      var layer = layui.layer;
      var $ = layui.$;

      var _agents = [];
      var _snap = null;
      var _rendered = false;

      // Static endpoint list (matching server/config/endpoints.js)
      var STATIC_EPS = [
        { key: 'members', name: 'Danh sách hội viên', isDate: false },
        { key: 'invites', name: 'Mã mời', isDate: false },
        { key: 'deposits', name: 'Nạp / Rút tiền', isDate: true },
        { key: 'withdrawals', name: 'Lịch sử rút tiền', isDate: true },
        { key: 'bet-orders', name: 'Đơn cược bên thứ 3', isDate: true },
        { key: 'lottery-bets', name: 'Đơn cược xổ số', isDate: true },
        { key: 'lottery-bets-summary', name: 'Tổng hợp đơn cược xổ số', isDate: true },
        { key: 'report-lottery', name: 'Báo cáo xổ số', isDate: true },
        { key: 'report-funds', name: 'Sao kê giao dịch', isDate: true },
        { key: 'report-third', name: 'Báo cáo nhà cung cấp game', isDate: true }
      ];

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
          _snap.agents.forEach(function (a) { snapMap[a.agentId] = a; });
        }

        return _agents.map(function (a) {
          var pa = snapMap[a.id];
          var isSyncing = pa && pa.status === 'syncing';

          var node = {
            id: a.id,
            name: a.label,
            isAgent: true,
            agentId: a.id,
            lockedDays: a.lockedDays || 0,
            agentStatus: a.status,
            syncing: isSyncing,
            elapsed: isSyncing ? (pa.elapsed || 0) : 0
          };

          if (isSyncing && pa.endpoints && pa.endpoints.length > 0) {
            // Real-time progress from active sync
            node.children = pa.endpoints.map(function (ep, idx) {
              return {
                id: a.id * 1000 + idx + 1,
                name: ep.name || ep.key,
                isAgent: false,
                total: ep.total,
                completed: ep.completed,
                dataRows: ep.rows || 0,
                epStatus: ep.status
              };
            });
          } else {
            // Static endpoint list with lockedDays estimate
            var locked = a.lockedDays || 0;
            node.children = STATIC_EPS.map(function (ep, idx) {
              return {
                id: a.id * 1000 + idx + 1,
                name: ep.name,
                isAgent: false,
                total: ep.isDate ? 65 : 1,
                completed: ep.isDate ? locked : 0,
                dataRows: 0,
                epStatus: ep.isDate ? (locked >= 65 ? 'done' : 'idle') : 'idle'
              };
            });
          }

          return node;
        });
      }

      // ═══════════════════════════════════════
      // ── Render / reload treeTable ──
      // ═══════════════════════════════════════

      function renderTree() {
        var data = buildTreeData();
        if (!_rendered) {
          treeTable.render({
            id: 'ss_syncTree',
            elem: '#ss_syncTree',
            data: data,
            tree: {
              customName: { children: 'children' }
            },
            size: 'sm',
            even: true,
            cols: [[
              { field: 'name', title: 'Đại lý / Loại dữ liệu', minWidth: 220, templet: function (d) {
                if (d.isAgent) {
                  var c = d.agentStatus === 1 ? '#16b777' : '#ff5722';
                  return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'
                    + c + ';margin-right:8px;vertical-align:middle;"></span><b>' + d.name + '</b>';
                }
                return d.name;
              }},
              { title: 'Tiến trình', minWidth: 220, templet: function (d) {
                var completed, total, color;
                if (d.isAgent) {
                  completed = d.lockedDays; total = 65;
                } else {
                  completed = d.completed || 0; total = d.total || 0;
                }
                var pct = total > 0 ? Math.round((completed / total) * 100) : 0;
                if (pct > 100) pct = 100;
                if (d.isAgent) {
                  color = pct >= 100 ? '#16b777' : pct >= 50 ? '#ffb800' : '#ff4d4f';
                } else {
                  color = d.epStatus === 'done' ? '#16b777' : d.epStatus === 'error' ? '#ff5722' : d.epStatus === 'idle' ? '#999' : '#1e9fff';
                }
                return '<div style="display:flex;align-items:center;gap:10px;">'
                  + '<div style="flex:1;height:8px;background:rgba(0,0,0,0.06);border-radius:4px;overflow:hidden;">'
                  + '<div style="width:' + pct + '%;height:100%;background:' + color + ';border-radius:4px;transition:width .4s;"></div></div>'
                  + '<span style="font-size:12px;color:' + color + ';font-weight:700;white-space:nowrap;">'
                  + completed + '/' + total + '</span></div>';
              }},
              { title: 'Dòng', width: 90, align: 'right', templet: function (d) {
                if (d.isAgent) return '';
                return d.dataRows > 0
                  ? '<span style="font-weight:600;">' + d.dataRows.toLocaleString() + '</span>'
                  : '<span style="color:#999;">—</span>';
              }},
              { title: HubLang.t('status'), width: 110, align: 'center', templet: function (d) {
                if (d.isAgent) {
                  if (d.syncing) {
                    return '<span style="background:#1e9fff;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;">Đang chạy</span>';
                  }
                  return d.agentStatus === 1
                    ? '<span style="color:#16b777;font-weight:600;">' + HubLang.t('active') + '</span>'
                    : '<span style="color:#ff5722;font-weight:600;">' + HubLang.t('locked') + '</span>';
                }
                if (d.epStatus === 'done') return '<span style="background:#16b777;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;">Xong</span>';
                if (d.epStatus === 'error') return '<span style="background:#ff5722;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;">Lỗi</span>';
                if (d.epStatus === 'syncing') return '<span style="background:#1e9fff;color:#fff;padding:2px 8px;border-radius:3px;font-size:12px;">Đang chạy</span>';
                if (d.epStatus === 'idle') return '<span style="color:#999;">—</span>';
                return '<span style="color:#999;">Chờ</span>';
              }},
              { title: 'Thời gian', width: 90, align: 'right', templet: function (d) {
                if (!d.isAgent || !d.elapsed) return '';
                return '<span style="font-size:12px;color:#1e9fff;">' + fmtElapsed(d.elapsed) + '</span>';
              }},
              { title: HubLang.t('actions'), width: 200, align: 'center', toolbar: '#ss_toolbarTpl' }
            ]]
          });
          _rendered = true;
        } else {
          treeTable.reloadData('ss_syncTree', { data: data });
        }
      }

      // ═══════════════════════════════════════
      // ── Toolbar template + events ──
      // ═══════════════════════════════════════

      if (!document.getElementById('ss_toolbarTpl')) {
        var tpl = document.createElement('script');
        tpl.type = 'text/html';
        tpl.id = 'ss_toolbarTpl';
        tpl.innerHTML = '{{# if(d.isAgent){ }}'
          + '<div class="layui-btn-group">'
          + '<button class="layui-btn layui-btn-xs layui-btn-normal" lay-event="sync"><i class="hi hi-arrows-rotate"></i> ' + HubLang.t('syncNow') + '</button>'
          + '<button class="layui-btn layui-btn-xs layui-btn-danger" lay-event="clear"><i class="hi hi-trash-can"></i> Xoá khoá</button>'
          + '</div>'
          + '{{# } }}';
        document.body.appendChild(tpl);
      }

      treeTable.on('tool(ss_syncTree)', function (obj) {
        var d = obj.data;
        if (!d.isAgent) return;

        if (obj.event === 'sync') {
          layer.confirm(HubLang.t('confirmSync') + ' "' + d.name + '"?', { icon: 3 }, function (idx) {
            layer.close(idx);
            HubAPI.adminRequest('sync/run', 'POST', { agent_id: d.agentId }).then(function (res) {
              if (res.code === 0) {
                layer.msg(HubLang.t('syncStarted'), { icon: 1 });
                setTimeout(loadAgents, 2000);
              } else {
                layer.msg(res.msg || HubLang.t('error'), { icon: 2 });
              }
            }).catch(function () { layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
          });
        } else if (obj.event === 'clear') {
          layer.confirm('Xoá tất cả khoá ngày của "' + d.name + '"?', { icon: 3 }, function (idx) {
            layer.close(idx);
            HubAPI.adminRequest('sync/clear', 'POST', { agent_id: d.agentId }).then(function (res) {
              if (res.code === 0) {
                layer.msg(res.msg || 'Đã xoá', { icon: 1 });
                loadAgents();
              } else {
                layer.msg(res.msg || HubLang.t('error'), { icon: 2 });
              }
            }).catch(function () { layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
          });
        }
      });

      // Sync All
      var btnAll = container.querySelector('#ss_btnSyncAll');
      if (btnAll) {
        btnAll.onclick = function () {
          layer.confirm(HubLang.t('confirmSync'), { icon: 3 }, function (idx) {
            layer.close(idx);
            HubAPI.adminRequest('sync/run-all', 'POST', {}).then(function (res) {
              if (res.code === 0) {
                layer.msg(HubLang.t('syncStarted'), { icon: 1 });
                setTimeout(loadAgents, 2000);
              } else {
                layer.msg(res.msg || HubLang.t('error'), { icon: 2 });
              }
            }).catch(function () { layer.msg(HubLang.t('connectionError'), { icon: 2 }); });
          });
        };
      }

      // ═══════════════════════════════════════
      // ── Data loading ──
      // ═══════════════════════════════════════

      function loadAgents() {
        HubAPI.adminGet('sync/status').then(function (res) {
          if (res.code !== 0) return;
          var d = res.data;
          _agents = d.agents || [];

          // Stat cards
          var active = _agents.filter(function (a) { return a.status === 1; }).length;
          var full = _agents.filter(function (a) { return a.lockedDays >= 65; }).length;
          setNum('ss_totalAgents', _agents.length);
          setNum('ss_activeAgents', active);
          setNum('ss_fullySynced', full + '/' + _agents.length);

          var stateEl = container.querySelector('#ss_syncState');
          if (stateEl) {
            stateEl.textContent = d.syncing ? 'Đang chạy' : 'Sẵn sàng';
            stateEl.style.color = d.syncing ? '#ff4d4f' : '#16b777';
          }

          // Polling
          if (d.syncing && !_pollTimer) {
            startProgressPoll();
          } else if (!d.syncing && _pollTimer) {
            stopProgressPoll();
            _snap = null;
          }

          renderTree();
        }).catch(function () {});
      }

      function pollProgress() {
        HubAPI.adminGet('sync/progress-data').then(function (res) {
          if (res.code !== 0 || !res.data) return;

          if (!res.data.agents || res.data.agents.length === 0) {
            _snap = null;
            stopProgressPoll();
            loadAgents();
            return;
          }

          _snap = res.data;
          renderTree();
        }).catch(function () {});
      }

      function startProgressPoll() {
        if (_pollTimer) return;
        pollProgress();
        _pollTimer = setInterval(pollProgress, 3000);
      }

      function stopProgressPoll() {
        if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
      }

      // ── Init ──
      loadAgents();
      _statsTimer = setInterval(loadAgents, 30000);
    },

    destroy: function () {
      if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
      if (_statsTimer) { clearInterval(_statsTimer); _statsTimer = null; }
    },

    onLangChange: function (container) {
      this.destroy();
      container.innerHTML = this.getHTML();
      HubLang.applyDOM(container);
      this.init(container);
    }
  };
})();
