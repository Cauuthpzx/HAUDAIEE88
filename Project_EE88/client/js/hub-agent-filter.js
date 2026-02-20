/**
 * HubAgentFilter — Loc dai ly theo dung pattern loc cot layui
 *
 * onClick nhan { data, config, openPanel, elem } tu layui table.
 * Toggle layui-hide tren <tr> + table.resize() — giong het column filter.
 */
window.HubAgentFilter = (function () {
  var _agents = null;
  var _selected = {};
  var _callbacks = {};
  var _listened = {};
  var HIDE = 'layui-hide';

  function loadAgents(cb) {
    if (_agents) return cb(_agents);
    layui.$.get('/api/data/agents', function (res) {
      _agents = res.code === 0 && res.data ? res.data : [];
      cb(_agents);
    });
  }

  function create(tableId) {
    return {
      name: 'agentFilter',
      title: HubLang.t('filterAgent'),
      layEvent: 'LAYTABLE_AGENT_FILTER_' + tableId,
      icon: 'layui-icon-group',
      onClick: function (obj) {
        // obj.data    = table.cache[id]
        // obj.config  = table options
        // obj.openPanel = function(sets)
        // obj.elem    = toolbar button element
        var data = obj.data;
        var tableView = obj.elem.closest('.layui-table-view');
        var tableConfig = obj.config;

        loadAgents(function (agents) {
          if (!agents.length) return;

          if (!_selected[tableId]) {
            _selected[tableId] = agents.map(function (a) {
              return a.id;
            });
          }
          var selected = _selected[tableId];
          var allChecked = selected.length === agents.length;

          // Build checkbox list — giong column filter
          var lis = [];
          lis.push(
            '<li style="border-bottom:1px solid #e2e2e2;">' +
              '<input type="checkbox" lay-skin="primary" ' +
              (allChecked ? 'checked' : '') +
              ' title="' +
              HubLang.t('selectAll') +
              '" lay-filter="LAY_AF_ALL_' +
              tableId +
              '"></li>'
          );
          agents.forEach(function (agent) {
            lis.push(
              '<li><input type="checkbox" name="' +
                agent.id +
                '" lay-skin="primary" ' +
                (selected.indexOf(agent.id) !== -1 ? 'checked' : '') +
                ' title="' +
                agent.label +
                ' (' +
                agent.ee88_username +
                ')" lay-filter="LAY_AF_' +
                tableId +
                '"></li>'
            );
          });

          obj.openPanel({
            list: lis.join(''),
            done: function () {
              if (_listened[tableId]) return;
              _listened[tableId] = true;

              var form = layui.form;

              // Toggle rows — giong het column filter toggle cols
              function toggleRows() {
                // Static table: dung callback
                if (_callbacks[tableId]) {
                  _callbacks[tableId](
                    _selected[tableId],
                    _selected[tableId].length === agents.length
                  );
                  return;
                }

                // URL table: toggle layui-hide tren <tr>
                // Giong: that.elem.find('*[data-key]').addClass/removeClass(HIDE)
                var cache = data;
                for (var i = 0; i < cache.length; i++) {
                  if (layui.type(cache[i]) === 'array') continue;
                  var show =
                    _selected[tableId].length === agents.length ||
                    _selected[tableId].indexOf(cache[i]._agent_id) !== -1;
                  tableView
                    .find('tr[data-index="' + i + '"]')
                    [show ? 'removeClass' : 'addClass'](HIDE);
                }

                // Giong: that.resize()
                layui.table.resize(tableId);
              }

              // Checkbox tung agent
              form.on('checkbox(LAY_AF_' + tableId + ')', function (o) {
                var agentId = parseInt(layui.$(o.elem).attr('name'));
                var sel = _selected[tableId];
                if (o.elem.checked) {
                  if (sel.indexOf(agentId) === -1) sel.push(agentId);
                } else {
                  _selected[tableId] = sel.filter(function (id) {
                    return id !== agentId;
                  });
                }
                // Update "chon tat ca"
                layui
                  .$(o.elem)
                  .closest('.layui-table-tool-panel')
                  .find('[lay-filter="LAY_AF_ALL_' + tableId + '"]')
                  .prop('checked', _selected[tableId].length === agents.length);
                form.render('checkbox');
                toggleRows();
              });

              // Checkbox "chon tat ca"
              form.on('checkbox(LAY_AF_ALL_' + tableId + ')', function (o) {
                if (o.elem.checked) {
                  _selected[tableId] = agents.map(function (a) {
                    return a.id;
                  });
                } else {
                  _selected[tableId] = [];
                }
                layui
                  .$(o.elem)
                  .closest('.layui-table-tool-panel')
                  .find('[lay-filter="LAY_AF_' + tableId + '"]')
                  .each(function () {
                    this.checked = o.elem.checked;
                  });
                form.render('checkbox');
                toggleRows();
              });
            }
          });
        });
      }
    };
  }

  return {
    create: create,

    onFilter: function (tableId, callback) {
      _callbacks[tableId] = callback;
    },

    getSelected: function (tableId) {
      if (!_selected[tableId] || !_agents) return '';
      return _selected[tableId].length === _agents.length
        ? ''
        : _selected[tableId].join(',');
    }
  };
})();
