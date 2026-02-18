/**
 * Hub i18n — Language packs cho layui.i18n
 * Hỗ trợ: vi (Tiếng Việt), en (English), zh-CN (中文)
 *
 * Sử dụng:
 *   HubLang.init()           — load ngôn ngữ đã lưu, set layui.i18n
 *   HubLang.setLang('en')    — đổi ngôn ngữ, lưu localStorage, apply DOM
 *   HubLang.applyDOM()       — scan data-i18n attributes và dịch
 *   HubLang.t(key)           — đọc trực tiếp từ appMessages (sync)
 */

var HubLang = (function () {
  var STORAGE_KEY = 'hub_lang';
  var DEFAULT_LANG = 'vi';

  var LANGS = {
    vi:      { label: 'Tiếng Việt', short: 'VN', flag: '/images/vn.gif' },
    en:      { label: 'English',    short: 'EN', flag: '/images/uk.gif' },
    'zh-CN': { label: '中文',       short: 'CN', flag: '/images/china.gif' }
  };

  // ── App-specific messages ──
  var appMessages = {
    vi: {
      // ── Page titles ──
      'adminPageTitle': 'Agent Hub — Quản lý',
      'loginPageTitle': 'Agent Hub — Đăng nhập',

      // ── Header ──
      'toggleMenu': 'Thu gọn menu',
      'reload': 'Tải lại trang',
      'fullscreen': 'Toàn màn hình',
      'language': 'Ngôn ngữ',
      'changeLoginPw': 'Đổi MK đăng nhập',
      'changeFundPw': 'Đổi MK giao dịch',
      'logout': 'Đăng xuất',
      'options': 'Tuỳ chọn',
      'noOptions': 'Chưa có tuỳ chọn nào.',

      // ── Sidebar ──
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

      // ── Tabs context ──
      'closeTab': 'Đóng',
      'closeOther': 'Đóng tab khác',
      'closeRight': 'Đóng tab bên phải',
      'closeAll': 'Đóng tất cả',

      // ── Login ──
      'loginTitle': 'Đăng nhập',
      'username': 'Tên đăng nhập',
      'password': 'Mật khẩu',
      'loginBtn': 'Đăng nhập',
      'loginSuccess': 'Đăng nhập thành công!',
      'loginFailed': 'Đăng nhập thất bại',
      'connectionError': 'Lỗi kết nối',

      // ── Common UI ──
      'search': 'Tìm kiếm',
      'reset': 'Đặt lại',
      'confirm': 'Xác nhận',
      'submit': 'Gửi đi',
      'cancel': 'Huỷ',
      'select': 'Chọn',
      'all': 'Tất cả',
      'noData': 'Không có dữ liệu',
      'actions': 'Thao tác',
      'edit': 'Sửa',
      'delete': 'Xoá',
      'active': 'Hoạt động',
      'locked': 'Khoá',
      'stopped': 'Ngừng',
      'failed': 'Thất bại',
      'updated': 'Đã cập nhật',
      'deleted': 'Đã xoá',
      'error': 'Lỗi',
      'serverError': 'Lỗi kết nối server',

      // ── Common data fields ──
      'accountName': 'Tên tài khoản',
      'enterAccountName': 'Nhập tên tài khoản',
      'serialNo': 'Mã giao dịch',
      'enterSerialNo': 'Nhập mã giao dịch',
      'account': 'Tài khoản',
      'agent': 'Đại lý',
      'amount': 'Số tiền',
      'trueAmount': 'Thực nhận',
      'createTime': 'Thời gian tạo',
      'updateTime': 'Cập nhật',
      'status': 'Trạng thái',
      'time': 'Thời gian',
      'id': 'ID',
      'uid': 'UID',
      'agentId': 'ID đại lý',
      'agentTree': 'Cây đại lý',
      'groupId': 'Nhóm',
      'remark': 'Ghi chú',

      // ── Date filters ──
      'today': 'Hôm nay',
      'yesterday': 'Hôm qua',
      'thisWeek': 'Tuần này',
      'thisMonth': 'Tháng này',
      'lastMonth': 'Tháng trước',
      'dateStartEnd': 'Bắt đầu - Kết thúc',
      'dateStartEndTime': 'Thời gian bắt đầu - Thời gian kết thúc',
      'summaryData': 'Dữ liệu tổng hợp:',

      // ── Status values ──
      'statusPending': 'Chờ xử lí',
      'statusDone': 'Hoàn tất',
      'statusProcessing': 'Đang xử lí',
      'statusFailed': 'Thất bại',
      'statusNotEval': 'Chưa đánh giá',
      'statusNormal': 'Bình thường',
      'statusFrozen': 'Đóng băng',
      'statusWait': 'Chờ',

      // ── Financial columns (shared) ──
      'operator': 'Thao tác viên',
      'successTime': 'Thời gian hoàn tất',
      'firmFee': 'Phí công ty',
      'userFee': 'Phí người dùng',
      'rebate': 'Hoàn trả',
      'accountHolder': 'Chủ tài khoản',
      'accountHolderShort': 'Tên chủ TK',
      'bankId': 'Ngân hàng',
      'branch': 'Chi nhánh',
      'accountNo': 'Số tài khoản',
      'transferTime': 'Thời gian CK',
      'userRemark': 'Ghi chú KH',
      'proStatus': 'Trạng thái xử lí',
      'prizeAmount': 'Tiền thưởng',
      'activityId': 'ID khuyến mãi',
      'extraInfo': 'Thông tin thêm',
      'categoryId': 'Danh mục',
      'merchantId': 'Nhà cung cấp',
      'payType': 'Hình thức TT',
      'tradeId': 'Mã thanh toán',
      'isTester': 'Thử nghiệm',
      'reviewTime': 'Thời gian duyệt',
      'transferRecord': 'Bản ghi CK',
      'currency': 'Tiền tệ',
      'balance': 'Số dư',
      'betAmount': 'Tiền cược',
      'turnover': 'Doanh thu',
      'prize': 'Trúng thưởng',
      'winLose': 'Thắng / Thua',
      'result': 'Kết quả',
      'rebateAmount': 'Hoàn trả',
      'betTimes': 'Lượt cược',
      'validAmount': 'Cược hợp lệ',

      // ── user.html (member management) ──
      'memberMgmtSub': 'Quản lí hội viên thuộc cấp',
      'addMemberBtn': 'Thêm hội viên',
      'addAgentBtn': 'Đại lý mới thêm',
      'setRebateBtn': 'Cài đặt hoàn trả',
      'firstDepositTime': 'Thời gian nạp đầu',
      'sortByField': 'Sắp xếp theo trường',
      'sortDirection': 'Sắp xếp theo hướng',
      'sortDesc': 'Từ lớn đến bé',
      'sortAsc': 'Từ bé đến lớn',
      'memberType': 'Loại hình hội viên',
      'agentAccount': 'Tài khoản đại lý',
      'member': 'Hội viên',
      'depositCount': 'Lần nạp',
      'withdrawCount': 'Lần rút',
      'totalDeposit': 'Tổng tiền nạp',
      'totalWithdraw': 'Tổng tiền rút',
      'lastLoginTime': 'Lần đăng nhập cuối',
      'registerTime': 'Thời gian đăng ký',
      'truename': 'Họ tên',
      'phone': 'Điện thoại',
      'email': 'Email',
      'inviteCode': 'Mã mời',
      'device': 'Thiết bị',
      'loginIp': 'IP đăng nhập',
      'level': 'Cấp độ',
      'agentType': 'Loại đại lý',
      'phoneVerified': 'XM điện thoại',
      'emailVerified': 'XM email',
      'userAgent': 'User Agent',
      'lastUpdate': 'Cập nhật cuối',
      'noteExtra': 'Ghi chú thêm',
      'addNewAgent': 'Thêm đại lý mới',
      'addNewMember': 'Thêm hội viên mới',
      'confirmPw': 'Xác nhận MK',
      'passwordNoMatch': 'Mật khẩu không khớp',
      'agentAdded': 'Đã thêm đại lý',
      'memberAdded': 'Đã thêm hội viên',
      'rebateTitle': 'Tỉ lệ hoàn trả',
      'rebateUpdated': 'Đã cập nhật hoàn trả',
      'rebateSetup': 'Cài đặt hoàn trả — ',
      'chars416': '4-16 ký tự',
      'chars620': '6-20 ký tự',
      'retypePw': 'Nhập lại mật khẩu',

      // ── inviteList.html ──
      'addInviteBtn': 'Thêm mã giới thiệu',
      'copyLink': 'Copy đường link',
      'viewConfig': 'Xem cài đặt',
      'qrCode': 'Mã QR',
      'editBtn': 'Chỉnh sửa',
      'addedTime': 'Thời gian thêm vào',
      'memberLoginTime': 'Thời gian hội viên đăng nhập',
      'enterInviteCode': 'Nhập đầy đủ mã giới thiệu',
      'inviteType': 'Loại hình giới thiệu',
      'totalRegistered': 'Tổng số đã đăng ký',
      'registeredUsers': 'Số lượng người dùng đã đăng ký',
      'rechargeCount': 'Số người nạp tiền',
      'firstRechargeDay': 'Nạp đầu trong ngày',
      'registerRechargeDay': 'Nạp đầu trong ngày đăng kí',
      'rebateArr': 'Hoàn trả',
      'copied': 'Đã copy: ',
      'configType': 'Loại hình',
      'notConfigured': 'Chưa cài đặt',
      'editInviteCode': 'Chỉnh sửa mã: ',
      'inviteDescription': 'Mô tả mã giới thiệu',
      'inviteAdded': 'Đã thêm mã giới thiệu',
      'configTitle': 'Cài đặt hoàn trả — ',
      'qrTitle': 'Mã QR — ',

      // ── reportLottery.html ──
      'reportLotteryTitle': 'Báo cáo xổ số',
      'lotteryType': 'Tên loại xổ',
      'selectOrSearch': 'Chọn hoặc nhập để tìm kiếm',
      'bettersCount': 'Số khách đặt cược',
      'betCount': 'Số lần cược',
      'validBetAmount': 'Tiền cược hợp lệ (trừ cược hoà)',
      'winLoseNoRebate': 'Kết quả thắng thua (không gồm hoàn trả)',
      'prizeCol': 'Tiền trúng',
      'lotteryName': 'Loại xổ số',
      'lotteryId': 'ID xổ số',

      // ── reportFunds.html ──
      'transStatementTitle': 'Sao kê giao dịch',
      'depositAmountTotal': 'Số tiền nạp',
      'withdrawAmountTotal': 'Số tiền rút',
      'chargeFee': 'Phí dịch vụ',
      'agentCommission': 'Hoa hồng đại lý',
      'promotion': 'Ưu đãi',
      'thirdRebate': 'Hoàn trả bên thứ 3',
      'thirdActivityAmount': 'Tiền thưởng từ bên thứ 3',
      'depositCountCol': 'Số lần nạp',
      'withdrawCountCol': 'Số lần rút',
      'dateCol': 'Ngày',

      // ── reportThirdGame.html ──
      'reportThirdTitle': 'Báo cáo nhà cung cấp game',
      'provider': 'Nhà cung cấp',
      'betTimesCol': 'Lượt cược',
      'bettersCountCol': 'Số người cược',
      'providerId': 'ID NCC',

      // ── depositAndWithdrawal.html ──
      'depositWithdrawTitle': 'Quản lí nạp / rút tiền',
      'typeCol': 'Loại',
      'typeDeposit': 'Nạp',
      'typeWithdraw': 'Rút',

      // ── withdrawalsRecord.html ──
      'withdrawHistoryTitle': 'Lịch sử rút tiền',
      'statusFormat': 'Trạng thái',

      // ── bet.html (lottery bets) ──
      'betListTitle': 'Danh sách đơn cược',
      'userName': 'Tên người dùng',
      'enterFullUsername': 'Vui lòng nhập đầy đủ Tên người dùng',
      'enterFullSerialNo': 'Nhập đầy đủ mã giao dịch',
      'game': 'Trò chơi',
      'gameType': 'Loại trò chơi',
      'playStyle': 'Cách chơi',
      'betStatusUnpaid': 'Chưa thanh toán',
      'betStatusWon': 'Trúng',
      'betStatusLost': 'Không trúng',
      'betStatusDraw': 'Hoà',
      'betStatusCancelUser': 'Khách huỷ đơn',
      'betStatusCancelSystem': 'Hệ thống huỷ đơn',
      'betStatusAbnormal': 'Đơn cược bất thường',
      'betStatusUnpaidManual': 'Chưa thanh toán (khôi phục thủ công)',
      'betTime': 'Thời gian cược',
      'issue': 'Kỳ',
      'betContent': 'Thông tin cược',
      'betMoney': 'Tiền cược',
      'betRebate': 'Tiền hoàn trả',
      'betResult': 'Thắng thua',
      'totalBetMoney': 'Tiền cược',
      'totalRebateAmount': 'Tiền hoàn trả',
      'totalWinLose': 'Thắng thua',

      // ── betOrder.html (3rd party bets) ──
      'thirdPartyBetTitle': 'Đơn cược bên thứ 3',
      'betTimeLabel': 'Thời gian cược',
      'platformAccount': 'Tài khoản platform',
      'enterPlatformAccount': 'Nhập tài khoản',
      'gameCategory': 'Loại game',
      'gameName': 'Tên game',
      'tkPlatform': 'TK Platform',
      'categoryTypeId': 'ID loại',

      // ── editPassword.html ──
      'editPwTitle': 'Đổi mật khẩu đăng nhập',
      'oldPw': 'Mật khẩu cũ',
      'enterOldPw': 'Nhập mật khẩu cũ',
      'newPassword': 'Mật khẩu mới',
      'confirmNewPw': 'Xác nhận mật khẩu mới',
      'enterConfirmNewPw': 'Nhập xác nhận mật khẩu mới',
      'pwMismatch': 'Mật khẩu mới và xác nhận không khớp',
      'pwChangeSuccess': 'Đổi mật khẩu thành công',
      'pwChangeFailed': 'Đổi mật khẩu thất bại',

      // ── editFundPassword.html ──
      'editFundPwTitle': 'Đổi mật khẩu giao dịch',
      'fundPwOldHint': 'Bạn vẫn chưa cài đặt mật khẩu giao dịch, mặc định để trống',
      'fundPwChangeSuccess': 'Đổi mật khẩu giao dịch thành công',
      'fundPwChangeFailed': 'Đổi mật khẩu thất bại',

      // ── getRebateOddsPanel.html ──
      'rebateOddsTitle': 'Tỉ lệ hoàn trả',

      // ── admin.html (header dropdown) ──
      'accountInfo': 'Thông tin tài khoản',
      'settings': 'Cài đặt',

      // ── manageAgents.html ──
      'manageAgentsTitle': 'Quản lý tài khoản Agent EE88',
      'solverOn': 'Solver: BẬT',
      'solverOff': 'Solver: TẮT',
      'baseUrlLabel': 'Base URL',
      'addAgentMgmt': 'Thêm Agent',
      'checkAll': 'Kiểm tra tất cả',
      'check': 'Kiểm tra',
      'login': 'Login',
      'agentLabel': 'Tên agent',
      'baseUrl': 'URL',
      'cookie': 'Cookie',
      'ee88Account': 'Tài khoản EE88',
      'ee88NotConfigured': 'Chưa cấu hình',
      'users': 'Users',
      'lastLoginCol': 'Login lần cuối',
      'lastCheck': 'Kiểm tra',
      'noAgents': 'Không có agent nào',
      'confirmDeleteAgent': 'Xác nhận xoá agent "',
      'agentOk': 'Agent hoạt động bình thường',
      'agentProblem': 'Agent có vấn đề',
      'addNewAgentMgmt': 'Thêm Agent mới',
      'editAgentTitle': 'Sửa agent: ',
      'autoLoginSection': 'Auto-login EE88 (tuỳ chọn)',
      'ee88Username': 'Tên đăng nhập EE88',
      'ee88Password': 'Mật khẩu EE88',
      'keepEmpty': 'Để trống = giữ nguyên',
      'cookieHint': 'PHPSESSID=xxx (để trống nếu dùng auto-login)',
      'agentExample': 'VD: Agent 1',
      'mgmtAgentAdded': 'Đã thêm agent',
      'loginConfirmMsg': 'Login tự động agent "',
      'loginProcessHint': 'Quá trình có thể mất 30-60 giây',
      'agentLoginSuccess': 'Login thành công',
      'agentLoginFailed': 'Login thất bại',
      'agentsWorking': ' agent hoạt động',

      // ── manageUsers.html ──
      'manageUsersTitle': 'Quản lý tài khoản Hub',
      'roleAdmin': 'Admin',
      'roleUser': 'User',
      'addUserBtn': 'Thêm User',
      'permissions': 'Phân quyền',
      'displayName': 'Tên hiển thị',
      'role': 'Vai trò',
      'assignedAgents': 'Agents được phân quyền',
      'allAdmin': 'Tất cả (admin)',
      'noPermission': 'Chưa phân quyền',
      'createdAt': 'Ngày tạo',
      'noUsers': 'Không có user nào',
      'confirmDeleteUser': 'Xác nhận xoá user "',
      'addNewUser': 'Thêm User mới',
      'editUserTitle': 'Sửa user: ',
      'newPwLabel': 'MK mới',
      'keepEmptyPw': 'Để trống nếu không đổi',
      'minChars6': 'Ít nhất 6 ký tự',
      'userAdded': 'Đã thêm user',
      'adminAllAccess': 'Admin có quyền truy cập tất cả agents',
      'selectAgentAccess': 'Chọn các agent mà user ',
      'selectAgentAccessSuffix': ' được phép truy cập:',
      'noAgentYet': 'Chưa có agent nào',
      'savePermissions': 'Lưu phân quyền',
      'permTitle': 'Phân quyền — ',
      'permUpdated': 'Đã cập nhật phân quyền',

      // ── Export ──
      'exportExcel': 'Xuất Excel',

      // ── Dashboard ──
      'dashboard': 'Tổng quan',
      'dbActiveAgents': 'Agent hoạt động',
      'dbExpiredAgents': 'Agent hết hạn',
      'dbTotalAgents': 'Tổng agents',
      'dbAgentStatus': 'Trạng thái Agent',
      'dbLoginStats': 'Thống kê Login (7 ngày)',
      'dbLoginSuccess': 'Thành công',
      'dbLoginFail': 'Thất bại',
      'dbRecentActivity': 'Hoạt động gần đây',

      // ── Activity Log ──
      'activityLog': 'Nhật ký',
      'activityLogTitle': 'Nhật ký hoạt động',
      'actionCol': 'Hành động',
      'targetCol': 'Đối tượng',
      'ipCol': 'IP',
      'detailCol': 'Chi tiết',
      'filterAction': 'Lọc hành động',
      'filterUsername': 'Lọc người dùng',

      // ── Login All + History ──
      'loginAllBtn': 'Login tất cả',
      'loginAllConfirm': 'Login tự động tất cả agent hết hạn?',
      'loginAllDone': 'Login xong',
      'loginHistory': 'Lịch sử',
      'loginHistoryTitle': 'Lịch sử login',
      'attemptsCol': 'Lần thử',
      'durationCol': 'Thời gian (ms)',
      'sourceCol': 'Nguồn',
      'triggeredByCol': 'Kích hoạt bởi',
      'errorCol': 'Lỗi',
      'successCol': 'Kết quả',

      // ── syncStatus.html (Phase 6: Cache + Sync) ──
      'syncStatus': 'Đồng bộ Cache',
      'syncStatusTitle': 'Trạng thái đồng bộ Cache',
      'syncNow': 'Đồng bộ ngay',
      'clearCache': 'Xoá cache',
      'cacheOverview': 'Tổng quan Cache',
      'totalCached': 'Tổng bản ghi',
      'totalRows': 'Tổng dòng dữ liệu',
      'lockedDays': 'Ngày đã khoá',
      'lastSyncTime': 'Đồng bộ lần cuối',
      'syncLogs': 'Lịch sử đồng bộ',
      'syncSuccess': 'Thành công',
      'syncError': 'Lỗi',
      'syncPending': 'Chờ',
      'syncRunning': 'Đang chạy',
      'endpoint': 'Endpoint',
      'cachedDate': 'Ngày cache',
      'rowCount': 'Số dòng',
      'noSyncData': 'Chưa có dữ liệu đồng bộ',
      'confirmSync': 'Bắt đầu đồng bộ dữ liệu?',
      'confirmClearCache': 'Xác nhận xoá toàn bộ cache?',
      'syncStarted': 'Đã bắt đầu đồng bộ',
      'cacheCleared': 'Đã xoá cache',
      'filterEndpoint': 'Lọc endpoint',
      'filterStatus': 'Lọc trạng thái',
      'filterAgent': 'Lọc agent',
      'syncing': 'Đang đồng bộ',
      'cacheHit': 'Cache HIT',
      'cacheMiss': 'Cache MISS'
    },

    en: {
      // ── Page titles ──
      'adminPageTitle': 'Agent Hub — Admin',
      'loginPageTitle': 'Agent Hub — Login',

      // ── Header ──
      'toggleMenu': 'Toggle menu',
      'reload': 'Reload page',
      'fullscreen': 'Fullscreen',
      'language': 'Language',
      'changeLoginPw': 'Change login password',
      'changeFundPw': 'Change fund password',
      'logout': 'Logout',
      'options': 'Options',
      'noOptions': 'No options available.',

      // ── Sidebar ──
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

      // ── Tabs context ──
      'closeTab': 'Close',
      'closeOther': 'Close other tabs',
      'closeRight': 'Close tabs to the right',
      'closeAll': 'Close all',

      // ── Login ──
      'loginTitle': 'Login',
      'username': 'Username',
      'password': 'Password',
      'loginBtn': 'Login',
      'loginSuccess': 'Login successful!',
      'loginFailed': 'Login failed',
      'connectionError': 'Connection error',

      // ── Common UI ──
      'search': 'Search',
      'reset': 'Reset',
      'confirm': 'Confirm',
      'submit': 'Submit',
      'cancel': 'Cancel',
      'select': 'Select',
      'all': 'All',
      'noData': 'No data',
      'actions': 'Actions',
      'edit': 'Edit',
      'delete': 'Delete',
      'active': 'Active',
      'locked': 'Locked',
      'stopped': 'Stopped',
      'failed': 'Failed',
      'updated': 'Updated',
      'deleted': 'Deleted',
      'error': 'Error',
      'serverError': 'Server connection error',

      // ── Common data fields ──
      'accountName': 'Account name',
      'enterAccountName': 'Enter account name',
      'serialNo': 'Transaction code',
      'enterSerialNo': 'Enter transaction code',
      'account': 'Account',
      'agent': 'Agent',
      'amount': 'Amount',
      'trueAmount': 'Actual amount',
      'createTime': 'Created time',
      'updateTime': 'Updated',
      'status': 'Status',
      'time': 'Time',
      'id': 'ID',
      'uid': 'UID',
      'agentId': 'Agent ID',
      'agentTree': 'Agent tree',
      'groupId': 'Group',
      'remark': 'Remark',

      // ── Date filters ──
      'today': 'Today',
      'yesterday': 'Yesterday',
      'thisWeek': 'This week',
      'thisMonth': 'This month',
      'lastMonth': 'Last month',
      'dateStartEnd': 'Start - End',
      'dateStartEndTime': 'Start time - End time',
      'summaryData': 'Summary data:',

      // ── Status values ──
      'statusPending': 'Pending',
      'statusDone': 'Completed',
      'statusProcessing': 'Processing',
      'statusFailed': 'Failed',
      'statusNotEval': 'Not evaluated',
      'statusNormal': 'Normal',
      'statusFrozen': 'Frozen',
      'statusWait': 'Waiting',

      // ── Financial columns ──
      'operator': 'Operator',
      'successTime': 'Completed time',
      'firmFee': 'Company fee',
      'userFee': 'User fee',
      'rebate': 'Rebate',
      'accountHolder': 'Account holder',
      'accountHolderShort': 'Account holder',
      'bankId': 'Bank',
      'branch': 'Branch',
      'accountNo': 'Account number',
      'transferTime': 'Transfer time',
      'userRemark': 'User remark',
      'proStatus': 'Processing status',
      'prizeAmount': 'Prize amount',
      'activityId': 'Promotion ID',
      'extraInfo': 'Extra info',
      'categoryId': 'Category',
      'merchantId': 'Provider',
      'payType': 'Payment type',
      'tradeId': 'Payment code',
      'isTester': 'Test account',
      'reviewTime': 'Review time',
      'transferRecord': 'Transfer record',
      'currency': 'Currency',
      'balance': 'Balance',
      'betAmount': 'Bet amount',
      'turnover': 'Turnover',
      'prize': 'Prize',
      'winLose': 'Win / Lose',
      'result': 'Result',
      'rebateAmount': 'Rebate',
      'betTimes': 'Bet count',
      'validAmount': 'Valid bet',

      // ── user.html ──
      'memberMgmtSub': 'Sub-member Management',
      'addMemberBtn': 'Add Member',
      'addAgentBtn': 'Add New Agent',
      'setRebateBtn': 'Set Rebate',
      'firstDepositTime': 'First deposit time',
      'sortByField': 'Sort by field',
      'sortDirection': 'Sort direction',
      'sortDesc': 'Descending',
      'sortAsc': 'Ascending',
      'memberType': 'Member type',
      'agentAccount': 'Agent account',
      'member': 'Member',
      'depositCount': 'Deposits',
      'withdrawCount': 'Withdrawals',
      'totalDeposit': 'Total deposits',
      'totalWithdraw': 'Total withdrawals',
      'lastLoginTime': 'Last login',
      'registerTime': 'Registration time',
      'truename': 'Full name',
      'phone': 'Phone',
      'email': 'Email',
      'inviteCode': 'Invite code',
      'device': 'Device',
      'loginIp': 'Login IP',
      'level': 'Level',
      'agentType': 'Agent type',
      'phoneVerified': 'Phone verified',
      'emailVerified': 'Email verified',
      'userAgent': 'User Agent',
      'lastUpdate': 'Last update',
      'noteExtra': 'Extra notes',
      'addNewAgent': 'Add new agent',
      'addNewMember': 'Add new member',
      'confirmPw': 'Confirm password',
      'passwordNoMatch': 'Passwords do not match',
      'agentAdded': 'Agent added',
      'memberAdded': 'Member added',
      'rebateTitle': 'Rebate rate',
      'rebateUpdated': 'Rebate updated',
      'rebateSetup': 'Rebate setup — ',
      'chars416': '4-16 characters',
      'chars620': '6-20 characters',
      'retypePw': 'Re-enter password',

      // ── inviteList.html ──
      'addInviteBtn': 'Add referral code',
      'copyLink': 'Copy link',
      'viewConfig': 'View settings',
      'qrCode': 'QR Code',
      'editBtn': 'Edit',
      'addedTime': 'Added time',
      'memberLoginTime': 'Member login time',
      'enterInviteCode': 'Enter full referral code',
      'inviteType': 'Referral type',
      'totalRegistered': 'Total registered',
      'registeredUsers': 'Registered users',
      'rechargeCount': 'Recharge count',
      'firstRechargeDay': 'First deposit today',
      'registerRechargeDay': 'First deposit on registration day',
      'rebateArr': 'Rebate',
      'copied': 'Copied: ',
      'configType': 'Type',
      'notConfigured': 'Not configured',
      'editInviteCode': 'Edit code: ',
      'inviteDescription': 'Referral code description',
      'inviteAdded': 'Referral code added',
      'configTitle': 'Rebate settings — ',
      'qrTitle': 'QR Code — ',

      // ── reportLottery.html ──
      'reportLotteryTitle': 'Lottery Report',
      'lotteryType': 'Lottery type',
      'selectOrSearch': 'Select or type to search',
      'bettersCount': 'Bettors',
      'betCount': 'Bet count',
      'validBetAmount': 'Valid bet amount (excl. draws)',
      'winLoseNoRebate': 'Win/Lose result (excl. rebate)',
      'prizeCol': 'Prize amount',
      'lotteryName': 'Lottery type',
      'lotteryId': 'Lottery ID',

      // ── reportFunds.html ──
      'transStatementTitle': 'Transaction Statement',
      'depositAmountTotal': 'Deposit amount',
      'withdrawAmountTotal': 'Withdrawal amount',
      'chargeFee': 'Service fee',
      'agentCommission': 'Agent commission',
      'promotion': 'Promotion',
      'thirdRebate': '3rd party rebate',
      'thirdActivityAmount': '3rd party bonus',
      'depositCountCol': 'Deposit count',
      'withdrawCountCol': 'Withdrawal count',
      'dateCol': 'Date',

      // ── reportThirdGame.html ──
      'reportThirdTitle': 'Game Provider Report',
      'provider': 'Provider',
      'betTimesCol': 'Bet count',
      'bettersCountCol': 'Bettors',
      'providerId': 'Provider ID',

      // ── depositAndWithdrawal.html ──
      'depositWithdrawTitle': 'Deposit / Withdrawal Management',
      'typeCol': 'Type',
      'typeDeposit': 'Deposit',
      'typeWithdraw': 'Withdrawal',

      // ── withdrawalsRecord.html ──
      'withdrawHistoryTitle': 'Withdrawal History',
      'statusFormat': 'Status',

      // ── bet.html ──
      'betListTitle': 'Bet List',
      'userName': 'Username',
      'enterFullUsername': 'Enter full username',
      'enterFullSerialNo': 'Enter full transaction code',
      'game': 'Game',
      'gameType': 'Game type',
      'playStyle': 'Play style',
      'betStatusUnpaid': 'Unpaid',
      'betStatusWon': 'Won',
      'betStatusLost': 'Lost',
      'betStatusDraw': 'Draw',
      'betStatusCancelUser': 'Cancelled by user',
      'betStatusCancelSystem': 'Cancelled by system',
      'betStatusAbnormal': 'Abnormal bet',
      'betStatusUnpaidManual': 'Unpaid (manual restore)',
      'betTime': 'Bet time',
      'issue': 'Issue',
      'betContent': 'Bet info',
      'betMoney': 'Bet amount',
      'betRebate': 'Rebate amount',
      'betResult': 'Win/Lose',
      'totalBetMoney': 'Bet amount',
      'totalRebateAmount': 'Rebate amount',
      'totalWinLose': 'Win/Lose',

      // ── betOrder.html ──
      'thirdPartyBetTitle': '3rd Party Bet Orders',
      'betTimeLabel': 'Bet time',
      'platformAccount': 'Platform account',
      'enterPlatformAccount': 'Enter account',
      'gameCategory': 'Game category',
      'gameName': 'Game name',
      'tkPlatform': 'Platform account',
      'categoryTypeId': 'Category ID',

      // ── editPassword.html ──
      'editPwTitle': 'Change Login Password',
      'oldPw': 'Old password',
      'enterOldPw': 'Enter old password',
      'newPassword': 'New password',
      'confirmNewPw': 'Confirm new password',
      'enterConfirmNewPw': 'Enter confirmation password',
      'pwMismatch': 'New password and confirmation do not match',
      'pwChangeSuccess': 'Password changed successfully',
      'pwChangeFailed': 'Password change failed',

      // ── editFundPassword.html ──
      'editFundPwTitle': 'Change Fund Password',
      'fundPwOldHint': 'Fund password not set yet, leave empty as default',
      'fundPwChangeSuccess': 'Fund password changed successfully',
      'fundPwChangeFailed': 'Password change failed',

      // ── getRebateOddsPanel.html ──
      'rebateOddsTitle': 'Rebate Rate',

      // ── admin.html (header dropdown) ──
      'accountInfo': 'Account Info',
      'settings': 'Settings',

      // ── manageAgents.html ──
      'manageAgentsTitle': 'Manage EE88 Agent Accounts',
      'solverOn': 'Solver: ON',
      'solverOff': 'Solver: OFF',
      'baseUrlLabel': 'Base URL',
      'addAgentMgmt': 'Add Agent',
      'checkAll': 'Check all',
      'check': 'Check',
      'login': 'Login',
      'agentLabel': 'Agent name',
      'baseUrl': 'URL',
      'cookie': 'Cookie',
      'ee88Account': 'EE88 Account',
      'ee88NotConfigured': 'Not configured',
      'users': 'Users',
      'lastLoginCol': 'Last login',
      'lastCheck': 'Last check',
      'noAgents': 'No agents found',
      'confirmDeleteAgent': 'Confirm delete agent "',
      'agentOk': 'Agent is working normally',
      'agentProblem': 'Agent has issues',
      'addNewAgentMgmt': 'Add New Agent',
      'editAgentTitle': 'Edit agent: ',
      'autoLoginSection': 'Auto-login EE88 (optional)',
      'ee88Username': 'EE88 username',
      'ee88Password': 'EE88 password',
      'keepEmpty': 'Leave empty = keep current',
      'cookieHint': 'PHPSESSID=xxx (leave empty for auto-login)',
      'agentExample': 'E.g. Agent 1',
      'mgmtAgentAdded': 'Agent added',
      'loginConfirmMsg': 'Auto-login agent "',
      'loginProcessHint': 'This may take 30-60 seconds',
      'agentLoginSuccess': 'Login successful',
      'agentLoginFailed': 'Login failed',
      'agentsWorking': ' agents working',

      // ── manageUsers.html ──
      'manageUsersTitle': 'Manage Hub Accounts',
      'roleAdmin': 'Admin',
      'roleUser': 'User',
      'addUserBtn': 'Add User',
      'permissions': 'Permissions',
      'displayName': 'Display name',
      'role': 'Role',
      'assignedAgents': 'Assigned agents',
      'allAdmin': 'All (admin)',
      'noPermission': 'No permissions',
      'createdAt': 'Created',
      'noUsers': 'No users found',
      'confirmDeleteUser': 'Confirm delete user "',
      'addNewUser': 'Add New User',
      'editUserTitle': 'Edit user: ',
      'newPwLabel': 'New password',
      'keepEmptyPw': 'Leave empty to keep current',
      'minChars6': 'At least 6 characters',
      'userAdded': 'User added',
      'adminAllAccess': 'Admin has access to all agents',
      'selectAgentAccess': 'Select agents that user ',
      'selectAgentAccessSuffix': ' can access:',
      'noAgentYet': 'No agents yet',
      'savePermissions': 'Save permissions',
      'permTitle': 'Permissions — ',
      'permUpdated': 'Permissions updated',

      // ── Export ──
      'exportExcel': 'Export Excel',

      // ── Dashboard ──
      'dashboard': 'Dashboard',
      'dbActiveAgents': 'Active Agents',
      'dbExpiredAgents': 'Expired Agents',
      'dbTotalAgents': 'Total Agents',
      'dbAgentStatus': 'Agent Status',
      'dbLoginStats': 'Login Stats (7 days)',
      'dbLoginSuccess': 'Success',
      'dbLoginFail': 'Failed',
      'dbRecentActivity': 'Recent Activity',

      // ── Activity Log ──
      'activityLog': 'Activity Log',
      'activityLogTitle': 'Activity Log',
      'actionCol': 'Action',
      'targetCol': 'Target',
      'ipCol': 'IP',
      'detailCol': 'Detail',
      'filterAction': 'Filter action',
      'filterUsername': 'Filter user',

      // ── Login All + History ──
      'loginAllBtn': 'Login All',
      'loginAllConfirm': 'Auto-login all expired agents?',
      'loginAllDone': 'Login complete',
      'loginHistory': 'History',
      'loginHistoryTitle': 'Login History',
      'attemptsCol': 'Attempts',
      'durationCol': 'Duration (ms)',
      'sourceCol': 'Source',
      'triggeredByCol': 'Triggered by',
      'errorCol': 'Error',
      'successCol': 'Result',

      // ── syncStatus.html (Phase 6: Cache + Sync) ──
      'syncStatus': 'Cache Sync',
      'syncStatusTitle': 'Cache Sync Status',
      'syncNow': 'Sync Now',
      'clearCache': 'Clear Cache',
      'cacheOverview': 'Cache Overview',
      'totalCached': 'Total Entries',
      'totalRows': 'Total Rows',
      'lockedDays': 'Locked Days',
      'lastSyncTime': 'Last Sync',
      'syncLogs': 'Sync Logs',
      'syncSuccess': 'Success',
      'syncError': 'Error',
      'syncPending': 'Pending',
      'syncRunning': 'Running',
      'endpoint': 'Endpoint',
      'cachedDate': 'Cached Date',
      'rowCount': 'Rows',
      'noSyncData': 'No sync data yet',
      'confirmSync': 'Start syncing data?',
      'confirmClearCache': 'Confirm clear all cache?',
      'syncStarted': 'Sync started',
      'cacheCleared': 'Cache cleared',
      'filterEndpoint': 'Filter endpoint',
      'filterStatus': 'Filter status',
      'filterAgent': 'Filter agent',
      'syncing': 'Syncing',
      'cacheHit': 'Cache HIT',
      'cacheMiss': 'Cache MISS'
    },

    'zh-CN': {
      // ── Page titles ──
      'adminPageTitle': 'Agent Hub — 管理',
      'loginPageTitle': 'Agent Hub — 登录',

      // ── Header ──
      'toggleMenu': '折叠菜单',
      'reload': '刷新页面',
      'fullscreen': '全屏',
      'language': '语言',
      'changeLoginPw': '修改登录密码',
      'changeFundPw': '修改资金密码',
      'logout': '退出登录',
      'options': '选项',
      'noOptions': '暂无选项。',

      // ── Sidebar ──
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

      // ── Tabs context ──
      'closeTab': '关闭',
      'closeOther': '关闭其他标签',
      'closeRight': '关闭右侧标签',
      'closeAll': '关闭所有',

      // ── Login ──
      'loginTitle': '登录',
      'username': '用户名',
      'password': '密码',
      'loginBtn': '登录',
      'loginSuccess': '登录成功！',
      'loginFailed': '登录失败',
      'connectionError': '连接错误',

      // ── Common UI ──
      'search': '搜索',
      'reset': '重置',
      'confirm': '确认',
      'submit': '提交',
      'cancel': '取消',
      'select': '选择',
      'all': '全部',
      'noData': '暂无数据',
      'actions': '操作',
      'edit': '编辑',
      'delete': '删除',
      'active': '活跃',
      'locked': '锁定',
      'stopped': '停用',
      'failed': '失败',
      'updated': '已更新',
      'deleted': '已删除',
      'error': '错误',
      'serverError': '服务器连接错误',

      // ── Common data fields ──
      'accountName': '账户名称',
      'enterAccountName': '输入账户名称',
      'serialNo': '交易编号',
      'enterSerialNo': '输入交易编号',
      'account': '账户',
      'agent': '代理',
      'amount': '金额',
      'trueAmount': '实际金额',
      'createTime': '创建时间',
      'updateTime': '更新时间',
      'status': '状态',
      'time': '时间',
      'id': 'ID',
      'uid': 'UID',
      'agentId': '代理ID',
      'agentTree': '代理树',
      'groupId': '分组',
      'remark': '备注',

      // ── Date filters ──
      'today': '今天',
      'yesterday': '昨天',
      'thisWeek': '本周',
      'thisMonth': '本月',
      'lastMonth': '上月',
      'dateStartEnd': '开始 - 结束',
      'dateStartEndTime': '开始时间 - 结束时间',
      'summaryData': '汇总数据：',

      // ── Status values ──
      'statusPending': '待处理',
      'statusDone': '已完成',
      'statusProcessing': '处理中',
      'statusFailed': '失败',
      'statusNotEval': '未评估',
      'statusNormal': '正常',
      'statusFrozen': '冻结',
      'statusWait': '等待',

      // ── Financial columns ──
      'operator': '操作员',
      'successTime': '完成时间',
      'firmFee': '公司费用',
      'userFee': '用户费用',
      'rebate': '返点',
      'accountHolder': '户主',
      'accountHolderShort': '户主',
      'bankId': '银行',
      'branch': '支行',
      'accountNo': '账号',
      'transferTime': '转账时间',
      'userRemark': '用户备注',
      'proStatus': '处理状态',
      'prizeAmount': '奖金',
      'activityId': '活动ID',
      'extraInfo': '附加信息',
      'categoryId': '分类',
      'merchantId': '供应商',
      'payType': '支付方式',
      'tradeId': '支付编号',
      'isTester': '测试账户',
      'reviewTime': '审核时间',
      'transferRecord': '转账记录',
      'currency': '货币',
      'balance': '余额',
      'betAmount': '投注金额',
      'turnover': '流水',
      'prize': '中奖',
      'winLose': '输赢',
      'result': '结果',
      'rebateAmount': '返点',
      'betTimes': '投注次数',
      'validAmount': '有效投注',

      // ── user.html ──
      'memberMgmtSub': '下级会员管理',
      'addMemberBtn': '添加会员',
      'addAgentBtn': '新增代理',
      'setRebateBtn': '设置返点',
      'firstDepositTime': '首充时间',
      'sortByField': '排序字段',
      'sortDirection': '排序方向',
      'sortDesc': '降序',
      'sortAsc': '升序',
      'memberType': '会员类型',
      'agentAccount': '代理账户',
      'member': '会员',
      'depositCount': '充值次数',
      'withdrawCount': '提现次数',
      'totalDeposit': '充值总额',
      'totalWithdraw': '提现总额',
      'lastLoginTime': '最后登录',
      'registerTime': '注册时间',
      'truename': '姓名',
      'phone': '电话',
      'email': '邮箱',
      'inviteCode': '邀请码',
      'device': '设备',
      'loginIp': '登录IP',
      'level': '等级',
      'agentType': '代理类型',
      'phoneVerified': '手机验证',
      'emailVerified': '邮箱验证',
      'userAgent': 'User Agent',
      'lastUpdate': '最后更新',
      'noteExtra': '额外备注',
      'addNewAgent': '添加新代理',
      'addNewMember': '添加新会员',
      'confirmPw': '确认密码',
      'passwordNoMatch': '密码不匹配',
      'agentAdded': '已添加代理',
      'memberAdded': '已添加会员',
      'rebateTitle': '返点比例',
      'rebateUpdated': '已更新返点',
      'rebateSetup': '设置返点 — ',
      'chars416': '4-16个字符',
      'chars620': '6-20个字符',
      'retypePw': '重新输入密码',

      // ── inviteList.html ──
      'addInviteBtn': '添加邀请码',
      'copyLink': '复制链接',
      'viewConfig': '查看设置',
      'qrCode': '二维码',
      'editBtn': '编辑',
      'addedTime': '添加时间',
      'memberLoginTime': '会员登录时间',
      'enterInviteCode': '输入完整邀请码',
      'inviteType': '邀请类型',
      'totalRegistered': '注册总数',
      'registeredUsers': '已注册用户',
      'rechargeCount': '充值人数',
      'firstRechargeDay': '当日首充',
      'registerRechargeDay': '注册日首充',
      'rebateArr': '返点',
      'copied': '已复制：',
      'configType': '类型',
      'notConfigured': '未配置',
      'editInviteCode': '编辑邀请码：',
      'inviteDescription': '邀请码描述',
      'inviteAdded': '已添加邀请码',
      'configTitle': '返点设置 — ',
      'qrTitle': '二维码 — ',

      // ── reportLottery.html ──
      'reportLotteryTitle': '彩票报表',
      'lotteryType': '彩种名称',
      'selectOrSearch': '选择或输入搜索',
      'bettersCount': '投注人数',
      'betCount': '投注次数',
      'validBetAmount': '有效投注（不含和局）',
      'winLoseNoRebate': '输赢结果（不含返点）',
      'prizeCol': '中奖金额',
      'lotteryName': '彩种',
      'lotteryId': '彩种ID',

      // ── reportFunds.html ──
      'transStatementTitle': '交易流水',
      'depositAmountTotal': '充值金额',
      'withdrawAmountTotal': '提现金额',
      'chargeFee': '手续费',
      'agentCommission': '代理佣金',
      'promotion': '优惠',
      'thirdRebate': '第三方返点',
      'thirdActivityAmount': '第三方奖金',
      'depositCountCol': '充值次数',
      'withdrawCountCol': '提现次数',
      'dateCol': '日期',

      // ── reportThirdGame.html ──
      'reportThirdTitle': '游戏供应商报表',
      'provider': '供应商',
      'betTimesCol': '投注次数',
      'bettersCountCol': '投注人数',
      'providerId': '供应商ID',

      // ── depositAndWithdrawal.html ──
      'depositWithdrawTitle': '充提管理',
      'typeCol': '类型',
      'typeDeposit': '充值',
      'typeWithdraw': '提现',

      // ── withdrawalsRecord.html ──
      'withdrawHistoryTitle': '提现记录',
      'statusFormat': '状态',

      // ── bet.html ──
      'betListTitle': '投注列表',
      'userName': '用户名',
      'enterFullUsername': '请输入完整用户名',
      'enterFullSerialNo': '输入完整交易编号',
      'game': '游戏',
      'gameType': '游戏类型',
      'playStyle': '玩法',
      'betStatusUnpaid': '未结算',
      'betStatusWon': '中奖',
      'betStatusLost': '未中奖',
      'betStatusDraw': '和局',
      'betStatusCancelUser': '用户取消',
      'betStatusCancelSystem': '系统取消',
      'betStatusAbnormal': '异常投注',
      'betStatusUnpaidManual': '未结算（手动恢复）',
      'betTime': '投注时间',
      'issue': '期号',
      'betContent': '投注信息',
      'betMoney': '投注金额',
      'betRebate': '返点金额',
      'betResult': '输赢',
      'totalBetMoney': '投注金额',
      'totalRebateAmount': '返点金额',
      'totalWinLose': '输赢',

      // ── betOrder.html ──
      'thirdPartyBetTitle': '第三方投注单',
      'betTimeLabel': '投注时间',
      'platformAccount': '平台账户',
      'enterPlatformAccount': '输入账户',
      'gameCategory': '游戏分类',
      'gameName': '游戏名称',
      'tkPlatform': '平台账户',
      'categoryTypeId': '分类ID',

      // ── editPassword.html ──
      'editPwTitle': '修改登录密码',
      'oldPw': '旧密码',
      'enterOldPw': '输入旧密码',
      'newPassword': '新密码',
      'confirmNewPw': '确认新密码',
      'enterConfirmNewPw': '输入确认密码',
      'pwMismatch': '新密码与确认密码不匹配',
      'pwChangeSuccess': '密码修改成功',
      'pwChangeFailed': '密码修改失败',

      // ── editFundPassword.html ──
      'editFundPwTitle': '修改资金密码',
      'fundPwOldHint': '未设置资金密码，默认留空',
      'fundPwChangeSuccess': '资金密码修改成功',
      'fundPwChangeFailed': '密码修改失败',

      // ── getRebateOddsPanel.html ──
      'rebateOddsTitle': '返点比例',

      // ── admin.html (header dropdown) ──
      'accountInfo': '账户信息',
      'settings': '设置',

      // ── manageAgents.html ──
      'manageAgentsTitle': '管理EE88代理账户',
      'solverOn': 'Solver: 开启',
      'solverOff': 'Solver: 关闭',
      'baseUrlLabel': 'Base URL',
      'addAgentMgmt': '添加代理',
      'checkAll': '检查全部',
      'check': '检查',
      'login': '登录',
      'agentLabel': '代理名称',
      'baseUrl': 'URL',
      'cookie': 'Cookie',
      'ee88Account': 'EE88账户',
      'ee88NotConfigured': '未配置',
      'users': '用户',
      'lastLoginCol': '最后登录',
      'lastCheck': '最后检查',
      'noAgents': '暂无代理',
      'confirmDeleteAgent': '确认删除代理"',
      'agentOk': '代理运行正常',
      'agentProblem': '代理有问题',
      'addNewAgentMgmt': '添加新代理',
      'editAgentTitle': '编辑代理：',
      'autoLoginSection': '自动登录EE88（可选）',
      'ee88Username': 'EE88用户名',
      'ee88Password': 'EE88密码',
      'keepEmpty': '留空=保持不变',
      'cookieHint': 'PHPSESSID=xxx（留空使用自动登录）',
      'agentExample': '例如：代理1',
      'mgmtAgentAdded': '已添加代理',
      'loginConfirmMsg': '自动登录代理"',
      'loginProcessHint': '此过程可能需要30-60秒',
      'agentLoginSuccess': '登录成功',
      'agentLoginFailed': '登录失败',
      'agentsWorking': '个代理正常运行',

      // ── manageUsers.html ──
      'manageUsersTitle': '管理Hub账户',
      'roleAdmin': 'Admin',
      'roleUser': 'User',
      'addUserBtn': '添加用户',
      'permissions': '权限',
      'displayName': '显示名称',
      'role': '角色',
      'assignedAgents': '已分配代理',
      'allAdmin': '全部（管理员）',
      'noPermission': '未分配权限',
      'createdAt': '创建时间',
      'noUsers': '暂无用户',
      'confirmDeleteUser': '确认删除用户"',
      'addNewUser': '添加新用户',
      'editUserTitle': '编辑用户：',
      'newPwLabel': '新密码',
      'keepEmptyPw': '留空不修改',
      'minChars6': '至少6个字符',
      'userAdded': '已添加用户',
      'adminAllAccess': '管理员有权访问所有代理',
      'selectAgentAccess': '选择用户',
      'selectAgentAccessSuffix': '可访问的代理：',
      'noAgentYet': '暂无代理',
      'savePermissions': '保存权限',
      'permTitle': '权限 — ',
      'permUpdated': '已更新权限',

      // ── Export ──
      'exportExcel': '导出Excel',

      // ── Dashboard ──
      'dashboard': '仪表盘',
      'dbActiveAgents': '活跃代理',
      'dbExpiredAgents': '过期代理',
      'dbTotalAgents': '代理总数',
      'dbAgentStatus': '代理状态',
      'dbLoginStats': '登录统计（7天）',
      'dbLoginSuccess': '成功',
      'dbLoginFail': '失败',
      'dbRecentActivity': '近期活动',

      // ── Activity Log ──
      'activityLog': '活动日志',
      'activityLogTitle': '活动日志',
      'actionCol': '操作',
      'targetCol': '对象',
      'ipCol': 'IP',
      'detailCol': '详情',
      'filterAction': '筛选操作',
      'filterUsername': '筛选用户',

      // ── Login All + History ──
      'loginAllBtn': '全部登录',
      'loginAllConfirm': '自动登录所有过期代理？',
      'loginAllDone': '登录完成',
      'loginHistory': '历史',
      'loginHistoryTitle': '登录历史',
      'attemptsCol': '尝试次数',
      'durationCol': '耗时（毫秒）',
      'sourceCol': '来源',
      'triggeredByCol': '触发者',
      'errorCol': '错误',
      'successCol': '结果',

      // ── syncStatus.html (Phase 6: Cache + Sync) ──
      'syncStatus': '缓存同步',
      'syncStatusTitle': '缓存同步状态',
      'syncNow': '立即同步',
      'clearCache': '清除缓存',
      'cacheOverview': '缓存概览',
      'totalCached': '总记录数',
      'totalRows': '总数据行',
      'lockedDays': '已锁定天数',
      'lastSyncTime': '上次同步',
      'syncLogs': '同步日志',
      'syncSuccess': '成功',
      'syncError': '错误',
      'syncPending': '等待',
      'syncRunning': '运行中',
      'endpoint': '接口',
      'cachedDate': '缓存日期',
      'rowCount': '行数',
      'noSyncData': '暂无同步数据',
      'confirmSync': '开始同步数据？',
      'confirmClearCache': '确认清除全部缓存？',
      'syncStarted': '同步已开始',
      'cacheCleared': '缓存已清除',
      'filterEndpoint': '筛选接口',
      'filterStatus': '筛选状态',
      'filterAgent': '筛选代理',
      'syncing': '同步中',
      'cacheHit': '缓存命中',
      'cacheMiss': '缓存未命中'
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

  // Đọc trực tiếp từ appMessages (sync, không cần layui.i18n)
  function t(key) {
    var lang = getLang();
    var msg = appMessages[lang] && appMessages[lang][key];
    if (msg !== undefined) return msg;
    // Fallback sang vi
    msg = appMessages.vi && appMessages.vi[key];
    return msg !== undefined ? msg : key;
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
