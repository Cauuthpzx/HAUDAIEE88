/**
 * Phase 4: Đầy đủ 8 endpoints
 */
const ENDPOINTS = {
  members: {
    path: '/agent/user.html',
    description: 'Danh sách hội viên',
    defaultParams: { page: 1, limit: 500 },
    timeout: 15000
  },
  invites: {
    path: '/agent/inviteList.html',
    description: 'Mã mời',
    defaultParams: { page: 1, limit: 500 },
    timeout: 15000
  },
  deposits: {
    path: '/agent/depositAndWithdrawal.html',
    description: 'Nạp / Rút tiền',
    defaultParams: { page: 1, limit: 500 },
    timeout: 15000
  },
  withdrawals: {
    path: '/agent/withdrawalsRecord.html',
    description: 'Lịch sử rút tiền',
    defaultParams: { page: 1, limit: 500 },
    timeout: 15000
  },
  'bet-orders': {
    path: '/agent/betOrder.html',
    description: 'Đơn cược bên thứ 3',
    defaultParams: { page: 1, limit: 500 },
    timeout: 30000
  },
  'report-lottery': {
    path: '/agent/reportLottery.html',
    description: 'Báo cáo xổ số',
    defaultParams: { page: 1, limit: 500 },
    timeout: 15000
  },
  'report-funds': {
    path: '/agent/reportFunds.html',
    description: 'Sao kê giao dịch',
    defaultParams: { page: 1, limit: 500 },
    timeout: 15000
  },
  'report-third': {
    path: '/agent/reportThirdGame.html',
    description: 'Báo cáo nhà cung cấp game',
    defaultParams: { page: 1, limit: 500 },
    timeout: 15000
  },
  'lottery-bets': {
    path: '/agent/bet.html',
    description: 'Đơn cược xổ số',
    defaultParams: { page: 1, limit: 10, es: 1 },
    timeout: 30000
  },
  'lottery-bets-summary': {
    path: '/agent/bet.html',
    description: 'Tổng hợp đơn cược xổ số',
    defaultParams: { is_summary: 1, es: 1 },
    timeout: 30000
  }
};

module.exports = ENDPOINTS;
