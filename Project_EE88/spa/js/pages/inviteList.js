(function () {
  SpaPages.inviteList = {

    getHTML: function () {
      return '<div class="layui-row">'
        + '<div class="layui-col-md12">'
        + '<div class="layui-card">'
        + '<div class="layui-form layui-card-header">'
        + '<fieldset class="layui-elem-field layui-field-title">'
        + '<legend data-i18n="referralCode">' + HubLang.t('referralCode') + '</legend>'
        + '<div class="layui-field-box">'
        + '<form class="layui-form" lay-filter="inv_searchForm">'

        // create_time datetime range
        + '<div class="layui-inline">'
        + '<label data-i18n="addedTime">' + HubLang.t('addedTime') + '</label>\uff1a'
        + '<div style="width:290px;" class="layui-input-inline">'
        + '<input type="text" name="create_time" id="inv_createTime"'
        + ' placeholder="' + HubLang.t('dateStartEnd') + '"'
        + ' class="layui-input" readonly autocomplete="off">'
        + '</div>'
        + '</div>'

        // user_register_time datetime range
        + '<div class="layui-inline">'
        + '<label data-i18n="memberLoginTime">' + HubLang.t('memberLoginTime') + '</label>\uff1a'
        + '<div style="width:290px;" class="layui-input-inline">'
        + '<input type="text" name="user_register_time" id="inv_registerTime"'
        + ' placeholder="' + HubLang.t('dateStartEnd') + '"'
        + ' class="layui-input" readonly autocomplete="off">'
        + '</div>'
        + '</div>'

        // invite_code input
        + '<div class="layui-inline">'
        + '<label data-i18n="referralCode">' + HubLang.t('referralCode') + '</label>\uff1a'
        + '<div style="width:240px;" class="layui-input-inline">'
        + '<input type="text" name="invite_code"'
        + ' placeholder="' + HubLang.t('enterInviteCode') + '"'
        + ' class="layui-input" autocomplete="off">'
        + '</div>'
        + '</div>'

        // search button
        + '<div class="layui-inline">'
        + '<button type="button" class="layui-btn" lay-submit lay-filter="inv_doSearch">'
        + '<i class="hi hi-magnifying-glass"></i> '
        + '<span data-i18n="search">' + HubLang.t('search') + '</span>'
        + '</button>'
        + '</div>'

        // reset button
        + '<div class="layui-inline">'
        + '<button type="reset" class="layui-btn layui-btn-primary" id="inv_btnReset">'
        + '<i class="hi hi-arrows-rotate"></i> '
        + '<span data-i18n="reset">' + HubLang.t('reset') + '</span>'
        + '</button>'
        + '</div>'

        + '</form>'
        + '</div>'
        + '</fieldset>'
        + '</div>'

        + '<div class="layui-card-body">'
        + '<table id="inv_dataTable" lay-filter="inv_dataTable"></table>'
        + '</div>'

        + '</div>'
        + '</div>'
        + '</div>'

        // ── Toolbar & row action templates (layui requires <script type="text/html"> with #id selector) ──
        + '<script type="text/html" id="inv_toolbarTpl">'
        + '<div class="layui-btn-group">'
        + '<button class="layui-btn layui-btn-sm" lay-event="addInvite">'
        + '<i class="hi hi-circle-plus"><\/i> '
        + '<span data-i18n="addInviteBtn">' + HubLang.t('addInviteBtn') + '<\/span>'
        + '<\/button>'
        + '<\/div>'
        + '<\/script>'

        + '<script type="text/html" id="inv_rowActionTpl">'
        + '<button class="layui-btn layui-btn-xs layui-btn-normal" lay-event="copyLink">'
        + '<span data-i18n="copyLink">' + HubLang.t('copyLink') + '<\/span>'
        + '<\/button> '
        + '<button class="layui-btn layui-btn-xs layui-btn-warm" lay-event="viewConfig">'
        + '<span data-i18n="viewConfig">' + HubLang.t('viewConfig') + '<\/span>'
        + '<\/button> '
        + '<button class="layui-btn layui-btn-xs layui-btn-danger" lay-event="qrCode">'
        + '<span data-i18n="qrCode">' + HubLang.t('qrCode') + '<\/span>'
        + '<\/button> '
        + '<button class="layui-btn layui-btn-xs" lay-event="edit">'
        + '<span data-i18n="editBtn">' + HubLang.t('editBtn') + '<\/span>'
        + '<\/button>'
        + '<\/script>';
    },

    init: function (container) {
      var table = layui.table;
      var form = layui.form;
      var laydate = layui.laydate;
      var layer = layui.layer;
      var $ = layui.$;

      var SERIES_NAMES = HubUtils.SERIES_NAMES;
      var DEFAULT_SERIES = HubUtils.DEFAULT_SERIES;

      function parseRebate(raw) {
        return HubUtils.parseRebate(raw);
      }

      function getInviteLink(code) {
        return window.location.origin + '/register?invite=' + code;
      }

      // ── Laydate date range pickers ──
      laydate.render({
        elem: '#inv_createTime',
        type: 'date',
        range: '|',
        rangeLinked: true
      });

      laydate.render({
        elem: '#inv_registerTime',
        type: 'date',
        range: '|',
        rangeLinked: true
      });

      form.render(null, 'inv_searchForm');

      // ── Table ──
      table.render({
        elem: '#inv_dataTable',
        id: 'inv_dataTable',
        url: '/api/data/invites',
        method: 'get',
        toolbar: '#inv_toolbarTpl',
        defaultToolbar: HubUtils.getDefaultToolbar(),
        page: true,
        limit: 10,
        text: { none: HubLang.t('noData') },
        parseData: HubUtils.parseData,
        request: { pageName: 'page', limitName: 'limit' },
        cols: [[
          { field: 'invite_code',            title: HubLang.t('referralCode'),       minWidth: 140 },
          { field: 'user_type',              title: HubLang.t('inviteType'),          minWidth: 120 },
          { field: 'reg_count',              title: HubLang.t('totalRegistered'),     minWidth: 120 },
          { field: 'scope_reg_count',        title: HubLang.t('registeredUsers'),     minWidth: 150 },
          { field: 'recharge_count',         title: HubLang.t('rechargeCount'),       minWidth: 130 },
          { field: 'first_recharge_count',   title: HubLang.t('firstRechargeDay'),    minWidth: 150 },
          { field: 'register_recharge_count',title: HubLang.t('registerRechargeDay'), minWidth: 170 },
          { field: 'remark',                 title: HubLang.t('remark'),              minWidth: 150 },
          { field: 'create_time',            title: HubLang.t('addedTime'),           minWidth: 160 },
          { field: 'id',                     title: 'ID',                             width: 90  },
          { field: 'uid',                    title: 'UID',                            width: 90  },
          { field: 'group_id',               title: HubLang.t('groupId'),             width: 80  },
          { field: 'rebate_arr',             title: HubLang.t('rebateArr'),           minWidth: 260,
            templet: function (d) {
              try {
                var obj = typeof d.rebate_arr === 'string' ? JSON.parse(d.rebate_arr) : d.rebate_arr;
                if (!obj || typeof obj !== 'object') return d.rebate_arr || '';
                var parts = [];
                for (var k in obj) {
                  parts.push((SERIES_NAMES[k] || k) + ':' + obj[k].value);
                }
                return parts.join(', ');
              } catch (e) { return d.rebate_arr || ''; }
            }
          },
          { field: 'update_time',            title: HubLang.t('updateTime'),          minWidth: 160 },
          { fixed: 'right', title: HubLang.t('actions'), minWidth: 360, toolbar: '#inv_rowActionTpl' }
        ]],
        done: function (res) {
          console.log('[inviteList] Loaded ' + (res.data ? res.data.length : 0) + '/' + res.count + ' records');
        }
      });

      // ── Toolbar events ──
      table.on('toolbar(inv_dataTable)', function (obj) {
        if (obj.event === 'LAYTABLE_XLSX') {
          HubUtils.exportExcel('inv_dataTable', 'invites');
          return;
        }
        if (obj.event === 'addInvite') {
          openInviteForm();
        }
      });

      // ── Row action events ──
      table.on('tool(inv_dataTable)', function (obj) {
        var d = obj.data;
        var link, rebates, html, i, qrLink, qrUrl;

        switch (obj.event) {

          case 'copyLink':
            link = getInviteLink(d.invite_code);
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(link).then(function () {
                layer.msg(HubLang.t('copied') + link, { icon: 1, time: 2000 });
              }).catch(function () {
                var input = document.createElement('input');
                input.value = link;
                document.body.appendChild(input);
                input.select();
                document.execCommand('copy');
                document.body.removeChild(input);
                layer.msg(HubLang.t('copied') + link, { icon: 1, time: 2000 });
              });
            } else {
              var input = document.createElement('input');
              input.value = link;
              document.body.appendChild(input);
              input.select();
              document.execCommand('copy');
              document.body.removeChild(input);
              layer.msg(HubLang.t('copied') + link, { icon: 1, time: 2000 });
            }
            break;

          case 'viewConfig':
            rebates = parseRebate(d.rebate_arr);
            html = '<table class="layui-table" style="margin:10px 0;">';
            html += '<thead><tr><th>' + HubLang.t('configType') + '</th><th>' + HubLang.t('rebateTitle') + '</th></tr></thead>';
            html += '<tbody>';
            if (rebates.length === 0) {
              html += '<tr><td colspan="2" style="text-align:center;">' + HubLang.t('notConfigured') + '</td></tr>';
            } else {
              for (i = 0; i < rebates.length; i++) {
                html += '<tr><td>' + rebates[i].name + '</td><td>' + rebates[i].value + '</td></tr>';
              }
            }
            html += '</tbody></table>';
            layer.open({
              type: 1,
              title: HubLang.t('configTitle') + d.invite_code,
              area: ['400px', 'auto'],
              shadeClose: true,
              content: '<div style="padding:15px;">' + html + '</div>'
            });
            break;

          case 'qrCode':
            qrLink = getInviteLink(d.invite_code);
            qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' + encodeURIComponent(qrLink);
            layer.open({
              type: 1,
              title: HubLang.t('qrTitle') + d.invite_code,
              area: ['300px', 'auto'],
              shadeClose: true,
              content: '<div style="padding:20px;text-align:center;">'
                + '<img src="' + qrUrl + '" style="width:200px;height:200px;" />'
                + '<p style="margin-top:10px;font-size:12px;color:#999;word-break:break-all;">' + qrLink + '</p>'
                + '</div>'
            });
            break;

          case 'edit':
            openInviteForm(d);
            break;
        }
      });

      // ── Open add / edit form ──
      function openInviteForm(data) {
        var isEdit = !!data;
        var title = isEdit
          ? HubLang.t('editInviteCode') + data.invite_code
          : HubLang.t('addInviteBtn');

        var rebates = isEdit ? parseRebate(data.rebate_arr) : [];
        var seriesList = rebates.length > 0 ? rebates : DEFAULT_SERIES;
        var rebateInputs = '';
        var i, val;
        for (i = 0; i < seriesList.length; i++) {
          val = seriesList[i].value !== undefined ? seriesList[i].value : '';
          rebateInputs += '<div class="layui-form-item">'
            + '<label class="layui-form-label">' + seriesList[i].name + '</label>'
            + '<div class="layui-input-block">'
            + '<input type="number" name="inv_rebate_' + seriesList[i].id + '" value="' + val + '"'
            + ' placeholder="0" class="layui-input" step="0.1" min="0" max="15">'
            + '</div>'
            + '</div>';
        }

        var formHtml = '<form class="layui-form" lay-filter="inv_submitInvite" style="padding:15px 30px 0 0;">'
          + '<div class="layui-form-item">'
          + '<label class="layui-form-label">' + HubLang.t('remark') + '</label>'
          + '<div class="layui-input-block">'
          + '<input type="text" name="inv_remark" value="' + (isEdit ? (data.remark || '') : '') + '"'
          + ' placeholder="' + HubLang.t('inviteDescription') + '" class="layui-input">'
          + '</div>'
          + '</div>'
          + '<fieldset class="layui-elem-field" style="margin:0 0 10px 110px;">'
          + '<legend style="font-size:13px;">' + HubLang.t('rebateTitle') + '</legend>'
          + '<div class="layui-field-box" style="padding:5px 15px;">'
          + rebateInputs
          + '</div>'
          + '</fieldset>'
          + '<div class="layui-form-item">'
          + '<div class="layui-input-block">'
          + '<button type="button" class="layui-btn" lay-submit lay-filter="inv_submitInvite">'
          + HubLang.t('confirm')
          + '</button>'
          + '<button type="reset" class="layui-btn layui-btn-primary">'
          + HubLang.t('reset')
          + '</button>'
          + '</div>'
          + '</div>'
          + '</form>';

        var layerIdx = layer.open({
          type: 1,
          title: title,
          area: ['550px', 'auto'],
          content: formHtml,
          success: function () { form.render(); }
        });

        form.on('submit(inv_submitInvite)', function (formData) {
          var body = { remark: formData.field.inv_remark };
          var rebateObj = {};
          var key, sid;
          for (key in formData.field) {
            if (key.indexOf('inv_rebate_') === 0) {
              sid = key.replace('inv_rebate_', '');
              rebateObj[sid] = { value: formData.field[key] || '0' };
            }
          }
          body.rebate_arr = JSON.stringify(rebateObj);

          if (isEdit) {
            body.id = data.id;
            body.invite_code = data.invite_code;
          }

          var actionUrl = isEdit ? '/api/action/editInvite' : '/api/action/addInvite';
          var loadIdx = layer.load();

          $.ajax({
            url: actionUrl,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(body),
            success: function (res) {
              layer.close(loadIdx);
              if (res.code === 0 || res.code === 1) {
                layer.close(layerIdx);
                layer.msg(isEdit ? HubLang.t('updated') : HubLang.t('inviteAdded'), { icon: 1 });
                table.reload('inv_dataTable');
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

      // ── Search ──
      form.on('submit(inv_doSearch)', function (data) {
        table.reload('inv_dataTable', { where: data.field, page: { curr: 1 } });
        return false;
      });

      // ── Reset ──
      var btnReset = container.querySelector('#inv_btnReset');
      if (btnReset) {
        btnReset.addEventListener('click', function () {
          setTimeout(function () {
            form.render('select', 'inv_searchForm');
            var createTimeEl = container.querySelector('#inv_createTime');
            var registerTimeEl = container.querySelector('#inv_registerTime');
            if (createTimeEl) createTimeEl.value = '';
            if (registerTimeEl) registerTimeEl.value = '';
            table.reload('inv_dataTable', {
              where: { invite_code: '', create_time: '', user_register_time: '' },
              page: { curr: 1 }
            });
          }, 50);
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
