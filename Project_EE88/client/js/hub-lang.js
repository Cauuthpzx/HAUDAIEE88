/**
 * Hub i18n — Language packs cho layui.i18n
 * Hỗ trợ: vi (Tiếng Việt), en (English), zh-CN (中文)
 *
 * Sử dụng:
 *   HubLang.init()           — load ngôn ngữ đã lưu, set layui.i18n
 *   HubLang.setLang('en')    — đổi ngôn ngữ, lưu localStorage, apply DOM
 *   HubLang.applyDOM()       — scan data-i18n attributes và dịch
 *   HubLang.t(key)           — shortcut cho layui.i18n.$t('app.key')
 */

var HubLang = (function () {
  var STORAGE_KEY = 'hub_lang';
  var DEFAULT_LANG = 'vi';

  var LANGS = {
    vi:      { label: 'Tiếng Việt', flag: '🇻🇳' },
    en:      { label: 'English',    flag: '🇺🇸' },
    'zh-CN': { label: '中文',       flag: '🇨🇳' }
  };

  // ── App-specific messages ──
  var appMessages = {
    vi: {
      // Header
      'toggleMenu': 'Thu gọn menu',
      'reload': 'Tải lại trang',
      'fullscreen': 'Toàn màn hình',
      'language': 'Ngôn ngữ',
      'changeLoginPw': 'Đổi MK đăng nhập',
      'changeFundPw': 'Đổi MK giao dịch',
      'logout': 'Đăng xuất',
      'options': 'Tuỳ chọn',
      'noOptions': 'Chưa có tuỳ chọn nào.',
      // Sidebar
      'memberMgmt': 'Quản lí hội viên',
      'members': 'Hội viên',
      'referralCode': 'Mã giới thiệu',
      'reports': 'Báo cáo',
      'lotteryReport': 'BC xổ số',
      'transStatement': 'Sao kê giao dịch',
      'providerReport': 'BC nhà cung cấp',
      'commission': 'Rút hoa hồng',
      'deposit': 'Nạp tiền',
      'withdraw': 'Rút tiền',
      'betOrders': 'Đơn cược',
      'lotteryBet': 'Đơn cược xổ số',
      'thirdPartyBet': 'Cược bên thứ 3',
      'customer': 'Khách hàng',
      'rebateRate': 'Tỉ lệ hoàn trả',
      'management': 'Quản lý',
      'manageAgents': 'Quản lý Agents',
      'manageUsers': 'Quản lý Users',
      // Tabs context
      'closeTab': 'Đóng',
      'closeOther': 'Đóng tab khác',
      'closeRight': 'Đóng tab bên phải',
      'closeAll': 'Đóng tất cả',
      // Login
      'loginTitle': 'Đăng nhập',
      'username': 'Tên đăng nhập',
      'password': 'Mật khẩu',
      'loginBtn': 'Đăng nhập',
      'loginSuccess': 'Đăng nhập thành công!',
      'loginFailed': 'Đăng nhập thất bại',
      'connectionError': 'Lỗi kết nối'
    },
    en: {
      'toggleMenu': 'Toggle menu',
      'reload': 'Reload page',
      'fullscreen': 'Fullscreen',
      'language': 'Language',
      'changeLoginPw': 'Change login password',
      'changeFundPw': 'Change fund password',
      'logout': 'Logout',
      'options': 'Options',
      'noOptions': 'No options available.',
      'memberMgmt': 'Member Management',
      'members': 'Members',
      'referralCode': 'Referral Code',
      'reports': 'Reports',
      'lotteryReport': 'Lottery Report',
      'transStatement': 'Transaction Statement',
      'providerReport': 'Provider Report',
      'commission': 'Commission',
      'deposit': 'Deposit',
      'withdraw': 'Withdraw',
      'betOrders': 'Bet Orders',
      'lotteryBet': 'Lottery Bet',
      'thirdPartyBet': '3rd Party Bet',
      'customer': 'Customer',
      'rebateRate': 'Rebate Rate',
      'management': 'Management',
      'manageAgents': 'Manage Agents',
      'manageUsers': 'Manage Users',
      'closeTab': 'Close',
      'closeOther': 'Close other tabs',
      'closeRight': 'Close tabs to the right',
      'closeAll': 'Close all',
      'loginTitle': 'Login',
      'username': 'Username',
      'password': 'Password',
      'loginBtn': 'Login',
      'loginSuccess': 'Login successful!',
      'loginFailed': 'Login failed',
      'connectionError': 'Connection error'
    },
    'zh-CN': {
      'toggleMenu': '折叠菜单',
      'reload': '刷新页面',
      'fullscreen': '全屏',
      'language': '语言',
      'changeLoginPw': '修改登录密码',
      'changeFundPw': '修改资金密码',
      'logout': '退出登录',
      'options': '选项',
      'noOptions': '暂无选项。',
      'memberMgmt': '会员管理',
      'members': '会员',
      'referralCode': '邀请码',
      'reports': '报表',
      'lotteryReport': '彩票报表',
      'transStatement': '交易流水',
      'providerReport': '供应商报表',
      'commission': '佣金提取',
      'deposit': '充值',
      'withdraw': '提现',
      'betOrders': '投注单',
      'lotteryBet': '彩票投注',
      'thirdPartyBet': '第三方投注',
      'customer': '客户',
      'rebateRate': '返点比例',
      'management': '管理',
      'manageAgents': '代理管理',
      'manageUsers': '用户管理',
      'closeTab': '关闭',
      'closeOther': '关闭其他标签',
      'closeRight': '关闭右侧标签',
      'closeAll': '关闭所有',
      'loginTitle': '登录',
      'username': '用户名',
      'password': '密码',
      'loginBtn': '登录',
      'loginSuccess': '登录成功！',
      'loginFailed': '登录失败',
      'connectionError': '连接错误'
    }
  };

  // ── Layui component messages (override zh-CN default) ──
  var layuiMessages = {
    vi: {
      form: {
        select: { noData: 'Không có dữ liệu', noMatch: 'Không tìm thấy', placeholder: 'Vui lòng chọn' },
        validateMessages: {
          required: 'Không được để trống',
          phone: 'Số điện thoại không đúng',
          email: 'Email không đúng',
          url: 'Đường dẫn không đúng',
          number: 'Chỉ được nhập số',
          date: 'Ngày tháng không đúng',
          identity: 'Số CMND không đúng'
        },
        verifyErrorPromptTitle: 'Thông báo'
      },
      laydate: {
        months: ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'],
        weeks: ['CN','T2','T3','T4','T5','T6','T7'],
        time: ['Giờ','Phút','Giây'],
        literal: { year: '' },
        selectDate: 'Chọn ngày',
        selectTime: 'Chọn giờ',
        startTime: 'Bắt đầu',
        endTime: 'Kết thúc',
        tools: { confirm: 'Xác nhận', clear: 'Xoá', now: 'Bây giờ', reset: 'Đặt lại' },
        rangeOrderPrompt: 'Ngày kết thúc không thể trước ngày bắt đầu',
        invalidDatePrompt: 'Ngoài phạm vi ngày/giờ hợp lệ',
        formatErrorPrompt: 'Định dạng ngày không hợp lệ\nPhải theo: \n{format}\n',
        autoResetPrompt: 'Đã tự động đặt lại',
        preview: 'Kết quả đã chọn'
      },
      layer: {
        confirm: 'Xác nhận',
        cancel: 'Huỷ',
        defaultTitle: 'Thông báo',
        prompt: { InputLengthPrompt: 'Tối đa {length} ký tự' },
        photos: {
          noData: 'Không có hình ảnh',
          viewPicture: 'Xem ảnh gốc'
        }
      },
      laypage: {
        prev: 'Trang trước', next: 'Trang sau', first: 'Đầu', last: 'Cuối',
        total: 'Tổng {total} mục', pagesize: 'mục/trang',
        'goto': 'Đến trang', page: '', confirm: 'OK'
      },
      table: {
        sort: { asc: 'Tăng dần', desc: 'Giảm dần' },
        noData: 'Không có dữ liệu',
        tools: {
          filter: { title: 'Lọc cột' },
          'export': { title: 'Xuất', noDataPrompt: 'Bảng không có dữ liệu', csvText: 'Xuất CSV' },
          print: { title: 'In', noDataPrompt: 'Bảng không có dữ liệu' }
        },
        xhrError: 'Lỗi yêu cầu: {msg}'
      },
      dropdown: { noData: 'Không có dữ liệu' },
      upload: {
        chooseText: '{length} tệp',
        validateMessages: {
          fileOverSizeLimit: 'Kích thước tệp không được vượt quá {size}'
        }
      }
    },
    en: {
      form: {
        select: { noData: 'No data', noMatch: 'No match', placeholder: 'Please select' },
        validateMessages: {
          required: 'Required',
          phone: 'Invalid phone number',
          email: 'Invalid email',
          url: 'Invalid URL',
          number: 'Numbers only',
          date: 'Invalid date',
          identity: 'Invalid ID'
        },
        verifyErrorPromptTitle: 'Notice'
      },
      laydate: {
        months: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
        weeks: ['Su','Mo','Tu','We','Th','Fr','Sa'],
        time: ['Hour','Min','Sec'],
        literal: { year: '' },
        selectDate: 'Select date',
        selectTime: 'Select time',
        startTime: 'Start',
        endTime: 'End',
        tools: { confirm: 'OK', clear: 'Clear', now: 'Now', reset: 'Reset' },
        rangeOrderPrompt: 'End date cannot be before start date',
        invalidDatePrompt: 'Outside valid date/time range',
        formatErrorPrompt: 'Invalid date format\nMust follow:\n{format}\n',
        autoResetPrompt: 'Auto reset',
        preview: 'Selected result'
      },
      layer: {
        confirm: 'OK',
        cancel: 'Cancel',
        defaultTitle: 'Info',
        prompt: { InputLengthPrompt: 'Max {length} characters' },
        photos: {
          noData: 'No images',
          viewPicture: 'View original'
        }
      },
      laypage: {
        prev: 'Prev', next: 'Next', first: 'First', last: 'Last',
        total: 'Total {total}', pagesize: '/page',
        'goto': 'Go to', page: '', confirm: 'Go'
      },
      table: {
        sort: { asc: 'Ascending', desc: 'Descending' },
        noData: 'No data',
        tools: {
          filter: { title: 'Filter columns' },
          'export': { title: 'Export', noDataPrompt: 'No data to export', csvText: 'Export CSV' },
          print: { title: 'Print', noDataPrompt: 'No data to print' }
        },
        xhrError: 'Request error: {msg}'
      },
      dropdown: { noData: 'No data' },
      upload: {
        chooseText: '{length} files',
        validateMessages: {
          fileOverSizeLimit: 'File size cannot exceed {size}'
        }
      }
    }
    // zh-CN: layui đã có sẵn, không cần override
  };

  function getLang() {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
  }

  function init() {
    var lang = getLang();

    layui.use('i18n', function () {
      var i18n = layui.i18n;

      // Thêm app messages vào mỗi locale
      Object.keys(appMessages).forEach(function (loc) {
        var merged = { app: appMessages[loc] };
        if (layuiMessages[loc]) {
          Object.keys(layuiMessages[loc]).forEach(function (k) {
            merged[k] = layuiMessages[loc][k];
          });
        }
        var msgs = {};
        msgs[loc] = merged;
        i18n.set({ messages: msgs });
      });

      // Set active locale
      i18n.set({ locale: lang });
    });
  }

  function setLang(lang) {
    if (!LANGS[lang]) return;
    localStorage.setItem(STORAGE_KEY, lang);

    layui.use('i18n', function () {
      layui.i18n.set({ locale: lang });
      applyDOM();
    });
  }

  function t(key, data) {
    try {
      return layui.i18n.$t('app.' + key, data);
    } catch (e) {
      return key;
    }
  }

  function applyDOM(root) {
    root = root || document;
    var els = root.querySelectorAll('[data-i18n]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var key = el.getAttribute('data-i18n');
      var text = t(key);
      if (!text || text === key) continue;

      // data-i18n-attr: thay attribute thay vì textContent
      var attr = el.getAttribute('data-i18n-attr');
      if (attr) {
        el.setAttribute(attr, text);
      } else {
        el.textContent = text;
      }
    }
  }

  return {
    LANGS: LANGS,
    getLang: getLang,
    init: init,
    setLang: setLang,
    t: t,
    applyDOM: applyDOM
  };
})();
