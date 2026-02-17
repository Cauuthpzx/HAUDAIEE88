(function () {
  SpaPages.editFundPassword = {
    getHTML: function () {
      return '<div class="layui-row"><div class="layui-col-md12"><div class="layui-card">'
        + '<div class="layui-card-header" data-i18n="editFundPwTitle">Đổi mật khẩu giao dịch</div>'
        + '<div class="layui-card-body" style="padding: 15px;">'
        + '<form class="layui-form" lay-filter="editFundPwdForm">'
        + '<div class="layui-form-item">'
        + '<label class="layui-form-label" data-i18n="oldPw">Mật khẩu cũ</label>'
        + '<div class="layui-input-block"><input type="password" autocomplete="off" name="oldPwd" placeholder="' + HubLang.t('fundPwOldHint') + '" class="layui-input"></div></div>'
        + '<div class="layui-form-item">'
        + '<label class="layui-form-label" data-i18n="newPassword">Mật khẩu mới</label>'
        + '<div class="layui-input-block"><input type="password" lay-verify="required" autocomplete="off" name="newPwd" placeholder="' + HubLang.t('newPassword') + '" class="layui-input"></div></div>'
        + '<div class="layui-form-item">'
        + '<label class="layui-form-label" data-i18n="confirmNewPw">Xác nhận mật khẩu mới</label>'
        + '<div class="layui-input-block"><input type="password" lay-verify="required" autocomplete="off" name="confirmPwd" placeholder="' + HubLang.t('enterConfirmNewPw') + '" class="layui-input"></div></div>'
        + '<div class="layui-form-item layui-layout-admin"><div class="layui-input-block">'
        + '<button type="button" lay-submit lay-filter="editFundPw_doSubmit" class="layui-btn"><span data-i18n="submit">Gửi đi</span></button>'
        + '</div></div></form></div></div></div></div>';
    },
    init: function (container) {
      var form = layui.form;
      var layer = layui.layer;
      var $ = layui.$;
      form.render(null, 'editFundPwdForm');

      form.on('submit(editFundPw_doSubmit)', function (data) {
        var field = data.field;
        if (field.newPwd !== field.confirmPwd) {
          layer.msg(HubLang.t('pwMismatch'), { icon: 5 });
          return false;
        }
        var loading = layer.load(1);
        $.ajax({
          url: '/api/action/editFundPassword', method: 'POST', contentType: 'application/json',
          data: JSON.stringify(field),
          success: function (res) {
            layer.close(loading);
            if (res.code === 0) {
              layer.msg(HubLang.t('fundPwChangeSuccess'), { icon: 1 });
            } else {
              layer.msg(res.msg || HubLang.t('fundPwChangeFailed'), { icon: 2 });
            }
          },
          error: function () { layer.close(loading); layer.msg(HubLang.t('serverError'), { icon: 2 }); }
        });
        return false;
      });
    },
    destroy: function () {},
    onLangChange: function (container) {
      container.innerHTML = this.getHTML();
      HubLang.applyDOM(container);
      this.init(container);
    }
  };
})();
