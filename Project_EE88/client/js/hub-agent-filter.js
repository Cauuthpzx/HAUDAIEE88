/**
 * HubAgentFilter — Module loc dai ly cho toolbar bang Layui
 *
 * Su dung:
 *   // URL-loaded table:
 *   defaultToolbar: [HubAgentFilter.create('dataTable'), 'filter', 'print', 'exports']
 *
 *   // Static data table:
 *   defaultToolbar: [HubAgentFilter.create('agentTable'), 'filter', 'print', 'exports']
 *   HubAgentFilter.onFilter('agentTable', function(selectedIds, allSelected) { ... });
 */
window.HubAgentFilter = (function () {
  var _agents = null;
  var _selected = {};
  var _callbacks = {};
  var _listened = {};

  // Load agents tu API, cache ket qua
  function loadAgents(cb) {
    if (_agents) return cb(_agents);
    var $ = layui.$;
    $.get('/api/data/agents', function (res) {
      _agents = res.code === 0 && res.data ? res.data : [];
      cb(_agents);
    });
  }

  // Tao defaultToolbar item
  function create(tableId) {
    return {
      name: 'agentFilter',
      title: HubLang.t('filterAgent'),
      layEvent: 'LAYTABLE_AGENT_FILTER_' + tableId,
      icon: 'layui-icon-group',
      onClick: function (obj) {
        openPanel(obj, tableId);
      }
    };
  }

  // Mo panel voi checkbox agent
  function openPanel(obj, tableId) {
    loadAgents(function (agents) {
      if (!agents.length) return;

      // Mac dinh: tat ca duoc chon
      if (!_selected[tableId]) {
        _selected[tableId] = agents.map(function (a) {
          return a.id;
        });
      }
      var selected = _selected[tableId];

      // Build checkbox list HTML
      var lis = [];
      var allChecked = selected.length === agents.length;

      // "Chon tat ca" checkbox
      lis.push(
        '<li style="border-bottom:1px solid #e2e2e2;">' +
          '<input type="checkbox" lay-skin="primary" ' +
          (allChecked ? 'checked' : '') +
          ' title="' +
          HubLang.t('selectAll') +
          '" ' +
          'lay-filter="LAY_AF_ALL_' +
          tableId +
          '"></li>'
      );

      // Per-agent checkboxes
      agents.forEach(function (agent) {
        var checked = selected.indexOf(agent.id) !== -1;
        lis.push(
          '<li><input type="checkbox" name="' +
            agent.id +
            '" ' +
            'lay-skin="primary" ' +
            (checked ? 'checked' : '') +
            ' title="' +
            agent.label +
            ' (' +
            agent.ee88_username +
            ')" ' +
            'lay-filter="LAY_AF_' +
            tableId +
            '"></li>'
        );
      });

      obj.openPanel({
        list: lis.join(''),
        done: function () {
          // Chi dang ky listener 1 lan per tableId
          if (_listened[tableId]) return;
          _listened[tableId] = true;

          var form = layui.form;

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
            var $panel = layui.$(o.elem).closest('.layui-table-tool-panel');
            $panel
              .find('[lay-filter="LAY_AF_ALL_' + tableId + '"]')
              .prop('checked', _selected[tableId].length === agents.length);
            form.render('checkbox');
            applyFilter(tableId);
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
            var $panel = layui.$(o.elem).closest('.layui-table-tool-panel');
            $panel
              .find('[lay-filter="LAY_AF_' + tableId + '"]')
              .each(function () {
                this.checked = o.elem.checked;
              });
            form.render('checkbox');
            applyFilter(tableId);
          });
        }
      });
    });
  }

  // Apply filter: reload table hoac goi callback
  function applyFilter(tableId) {
    var selected = _selected[tableId] || [];
    var agents = _agents || [];
    var allSelected = selected.length === agents.length;
    var agentIdsStr = allSelected ? '' : selected.join(',');

    // Static data table: dung callback
    if (_callbacks[tableId]) {
      _callbacks[tableId](selected, allSelected);
      return;
    }

    // URL table: reload voi agent_ids trong where
    layui.table.reload(tableId, {
      where: { agent_ids: agentIdsStr },
      page: { curr: 1 }
    });
  }

  return {
    create: create,

    // Dang ky callback cho static data table
    onFilter: function (tableId, callback) {
      _callbacks[tableId] = callback;
    },

    // Lay selected IDs hien tai (cho integration)
    getSelected: function (tableId) {
      if (!_selected[tableId] || !_agents) return '';
      return _selected[tableId].length === _agents.length
        ? ''
        : _selected[tableId].join(',');
    }
  };
})();
