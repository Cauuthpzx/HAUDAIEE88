(function () {
  SpaPages.getRebateOddsPanel = {
    getHTML: function () {
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-card-header" style="border-bottom:none;">'
        + '<div class="layui-inline"><div class="layui-input-inline">'
        + '<select id="rop_seriesSelect" lay-filter="rop_seriesSelect" style="display:block;height:32px;line-height:32px;font-size:14px;width:150px;"></select>'
        + '</div><div class="layui-input-inline" style="margin-left:10px;">'
        + '<select id="rop_lotterySelect" lay-filter="rop_lotterySelect" style="display:block;height:32px;line-height:32px;font-size:14px;width:150px;"></select>'
        + '</div></div></div>'
        + '<div class="layui-card-body" style="padding-top:0;">'
        + '<div class="layui-form"><div>'
        + '<table class="layui-table" id="rop_table"><thead><tr id="rop_thead"></tr></thead>'
        + '<tbody id="rop_tbody"></tbody></table>'
        + '</div></div></div>'
        + '</div></div></div>';
    },

    _state: null,

    init: function (container) {
      var self = this;
      var form = layui.form;
      var layer = layui.layer;
      var $ = layui.$;

      self._state = {
        seriesData: [],
        lotteryData: [],
        series_id: '',
        lottery_id: '',
        tableHead: [],
        tableBody: []
      };

      function renderSelects() {
        var sHtml = '';
        self._state.seriesData.forEach(function (item) {
          sHtml += '<option value="' + item.id + '"' + (item.id == self._state.series_id ? ' selected' : '') + '>' + item.name + '</option>';
        });
        $('#rop_seriesSelect').html(sHtml);

        var lHtml = '';
        self._state.lotteryData.forEach(function (item) {
          lHtml += '<option value="' + item.id + '" data-series="' + item.series_id + '"' + (item.id == self._state.lottery_id ? ' selected' : '') + '>' + item.name + '</option>';
        });
        $('#rop_lotterySelect').html(lHtml);
        form.render('select');
      }

      function renderTable() {
        var thead = '';
        self._state.tableHead.forEach(function (h) {
          thead += '<th>' + h.title + '</th>';
        });
        container.querySelector('#rop_thead').innerHTML = thead;

        var tbody = '';
        if (self._state.tableBody.length === 0) {
          tbody = '<tr><td colspan="' + self._state.tableHead.length + '" style="text-align:center;">' + HubLang.t('noData') + '</td></tr>';
        } else {
          self._state.tableBody.forEach(function (row) {
            tbody += '<tr>';
            row.forEach(function (val) { tbody += '<td>' + val + '</td>'; });
            tbody += '</tr>';
          });
        }
        container.querySelector('#rop_tbody').innerHTML = tbody;
      }

      // Init: load series + lottery + data
      var load = layer.load();
      HubAPI.action('getLottery', { type: 'init' }).then(function (res) {
        layer.close(load);
        var result = res.data;
        self._state.seriesData = result.seriesData;
        self._state.lotteryData = result.lotteryData;
        self._state.tableBody = result.tableBody;
        self._state.tableHead = result.tableHead;
        self._state.lottery_id = result.firsLotteryId;
        self._state.series_id = result.firsSeriesId;
        renderSelects();
        renderTable();
      }).catch(function () {
        layer.close(load);
        layer.msg(HubLang.t('failed'));
      });

      // Series change
      form.on('select(rop_seriesSelect)', function (data) {
        self._state.series_id = data.value;
        var load = layer.load();
        HubAPI.action('getLottery', { type: 'getLottery', series_id: data.value }).then(function (res) {
          layer.close(load);
          var result = res.data;
          self._state.seriesData = result.seriesData;
          self._state.lotteryData = result.lotteryData;
          self._state.tableBody = result.tableBody;
          self._state.tableHead = result.tableHead;
          self._state.lottery_id = result.firsLotteryId;
          self._state.series_id = result.firsSeriesId;
          renderSelects();
          renderTable();
        }).catch(function () {
          layer.close(load);
          layer.msg(HubLang.t('failed'));
        });
      });

      // Lottery change
      form.on('select(rop_lotterySelect)', function (data) {
        self._state.lottery_id = data.value;
        var opt = container.querySelector('#rop_lotterySelect option[value="' + data.value + '"]');
        var series_id = opt ? opt.getAttribute('data-series') : self._state.series_id;
        var load = layer.load();
        HubAPI.action('getRebateOddsPanel', { lottery_id: data.value, series_id: series_id }).then(function (res) {
          layer.close(load);
          var result = res.data;
          self._state.tableBody = result.tableBody;
          self._state.tableHead = result.tableHead;
          renderTable();
        }).catch(function () {
          layer.close(load);
          layer.msg(HubLang.t('failed'));
        });
      });
    },

    destroy: function () {
      this._state = null;
    },

    onLangChange: function (container) {
      container.innerHTML = this.getHTML();
      HubLang.applyDOM(container);
      this.init(container);
    }
  };
})();
