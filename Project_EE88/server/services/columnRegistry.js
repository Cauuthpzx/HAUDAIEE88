/**
 * Column Registry — source of truth cho admin UI biết mỗi trang có những cột nào.
 * Dùng cho phân quyền cột (deny-list): admin chọn cột nào bị ẩn cho từng user.
 *
 * Format: pageId → [{ field, labelKey }]
 * - field: tên field trong cols[] của table.render()
 * - labelKey: i18n key dùng làm label cho checkbox trong admin UI
 */

const COLUMN_REGISTRY = {
  members: [
    { field: 'username', labelKey: 'member' },
    { field: 'type_format', labelKey: 'memberType' },
    { field: 'parent_user', labelKey: 'agentAccount' },
    { field: 'money', labelKey: 'balance' },
    { field: 'deposit_count', labelKey: 'depositCount' },
    { field: 'withdrawal_count', labelKey: 'withdrawCount' },
    { field: 'deposit_amount', labelKey: 'totalDeposit' },
    { field: 'withdrawal_amount', labelKey: 'totalWithdraw' },
    { field: 'login_time', labelKey: 'lastLoginTime' },
    { field: 'register_time', labelKey: 'registerTime' },
    { field: 'status_format', labelKey: 'status' },
    { field: 'id', labelKey: 'ID' },
    { field: 'truename', labelKey: 'truename' },
    { field: 'phone', labelKey: 'phone' },
    { field: 'email', labelKey: 'Email' },
    { field: 'invite_code', labelKey: 'inviteCode' },
    { field: 'device', labelKey: 'device' },
    { field: 'login_ip', labelKey: 'loginIp' },
    { field: 'first_deposit_time', labelKey: 'firstDepositTime' },
    { field: 'level', labelKey: 'level' },
    { field: 'group_id', labelKey: 'groupId' },
    { field: 'agent_type', labelKey: 'agentType' },
    { field: 'is_tester', labelKey: 'isTester' },
    { field: 'user_tree', labelKey: 'agentTree' }
  ],

  reportLottery: [
    { field: 'username', labelKey: 'account' },
    { field: 'user_parent_format', labelKey: 'agent' },
    { field: 'bet_count', labelKey: 'betTimes' },
    { field: 'bet_amount', labelKey: 'betAmount' },
    { field: 'valid_amount', labelKey: 'validAmount' },
    { field: 'rebate_amount', labelKey: 'rebateAmount' },
    { field: 'result', labelKey: 'winLoseNoRebate' },
    { field: 'win_lose', labelKey: 'winLose' },
    { field: 'prize', labelKey: 'prize' },
    { field: 'lottery_name', labelKey: 'lotteryName' },
    { field: 'uid', labelKey: 'UID' },
    { field: 'lottery_id', labelKey: 'lotteryId' }
  ],

  reportFunds: [
    { field: 'username', labelKey: 'account' },
    { field: 'user_parent_format', labelKey: 'agent' },
    { field: 'deposit_count', labelKey: 'depositCountCol' },
    { field: 'withdrawal_count', labelKey: 'withdrawCountCol' },
    { field: 'deposit_amount', labelKey: 'depositAmountTotal' },
    { field: 'withdrawal_amount', labelKey: 'withdrawAmountTotal' },
    { field: 'charge_fee', labelKey: 'chargeFee' },
    { field: 'agent_commission', labelKey: 'agentCommission' },
    { field: 'promotion', labelKey: 'promotion' },
    { field: 'third_rebate', labelKey: 'thirdRebate' },
    { field: 'third_activity_amount', labelKey: 'thirdActivityAmount' },
    { field: 'date', labelKey: 'dateCol' },
    { field: 'uid', labelKey: 'UID' },
    { field: 'user_parent', labelKey: 'agentId' }
  ],

  reportThirdGame: [
    { field: 'username', labelKey: 'account' },
    { field: 'platform_id_name', labelKey: 'provider' },
    { field: 't_bet_times', labelKey: 'betTimes' },
    { field: 't_bet_amount', labelKey: 'betAmount' },
    { field: 't_turnover', labelKey: 'validBetAmount' },
    { field: 't_prize', labelKey: 'prize' },
    { field: 't_win_lose', labelKey: 'winLose' },
    { field: 'uid', labelKey: 'UID' },
    { field: 'platform_id', labelKey: 'providerId' }
  ],

  betOrder: [
    { field: 'serial_no', labelKey: 'serialNo' },
    { field: 'platform_id_name', labelKey: 'provider' },
    { field: 'c_name', labelKey: 'gameCategory' },
    { field: 'game_name', labelKey: 'gameName' },
    { field: 'bet_amount', labelKey: 'betAmount' },
    { field: 'turnover', labelKey: 'turnover' },
    { field: 'prize', labelKey: 'prize' },
    { field: 'win_lose', labelKey: 'winLose' },
    { field: 'bet_time', labelKey: 'betTime' },
    { field: 'platform_username', labelKey: 'tkPlatform' },
    { field: 'uid', labelKey: 'UID' },
    { field: 'platform_id', labelKey: 'providerId' },
    { field: 'cid', labelKey: 'categoryTypeId' }
  ],

  bet: [
    { field: 'serial_no', labelKey: 'serialNo' },
    { field: 'username', labelKey: 'userName' },
    { field: 'create_time', labelKey: 'betTime' },
    { field: 'lottery_name', labelKey: 'game' },
    { field: 'play_type_name', labelKey: 'gameType' },
    { field: 'play_name', labelKey: 'playStyle' },
    { field: 'issue', labelKey: 'issue' },
    { field: 'content', labelKey: 'betContent' },
    { field: 'money', labelKey: 'betMoney' },
    { field: 'rebate_amount', labelKey: 'betRebate' },
    { field: 'result', labelKey: 'betResult' },
    { field: 'status_text', labelKey: 'status' }
  ],

  withdrawals: [
    { field: 'serial_no', labelKey: 'serialNo' },
    { field: 'username', labelKey: 'account' },
    { field: 'user_parent_format', labelKey: 'agent' },
    { field: 'amount', labelKey: 'amount' },
    { field: 'true_amount', labelKey: 'trueAmount' },
    { field: 'name', labelKey: 'accountHolder' },
    { field: 'bank_id', labelKey: 'bankId' },
    { field: 'account', labelKey: 'accountNo' },
    { field: 'status_format', labelKey: 'status' },
    { field: 'operator', labelKey: 'operator' },
    { field: 'create_time', labelKey: 'createTime' },
    { field: 'success_time', labelKey: 'successTime' },
    { field: 'uid', labelKey: 'UID' },
    { field: 'user_parent', labelKey: 'agentId' },
    { field: 'firm_fee', labelKey: 'firmFee' },
    { field: 'user_fee', labelKey: 'userFee' },
    { field: 'rebate', labelKey: 'rebate' },
    { field: 'branch', labelKey: 'branch' }
  ],

  deposits: [
    { field: 'serial_no', labelKey: 'serialNo' },
    { field: 'username', labelKey: 'account' },
    { field: 'user_parent_format', labelKey: 'agent' },
    { field: 'type', labelKey: 'typeCol' },
    { field: 'amount', labelKey: 'amount' },
    { field: 'true_amount', labelKey: 'trueAmount' },
    { field: 'status', labelKey: 'status' },
    { field: 'operator', labelKey: 'operator' },
    { field: 'create_time', labelKey: 'createTime' },
    { field: 'success_time', labelKey: 'successTime' },
    { field: 'uid', labelKey: 'UID' },
    { field: 'user_parent', labelKey: 'agentId' },
    { field: 'firm_fee', labelKey: 'firmFee' },
    { field: 'user_fee', labelKey: 'userFee' },
    { field: 'rebate', labelKey: 'rebate' },
    { field: 'name', labelKey: 'accountHolderShort' },
    { field: 'bank_id', labelKey: 'bankId' },
    { field: 'branch', labelKey: 'branch' },
    { field: 'account', labelKey: 'accountNo' }
  ],

  inviteList: [
    { field: 'invite_code', labelKey: 'referralCode' },
    { field: 'user_type', labelKey: 'inviteType' },
    { field: 'reg_count', labelKey: 'totalRegistered' },
    { field: 'scope_reg_count', labelKey: 'registeredUsers' },
    { field: 'recharge_count', labelKey: 'rechargeCount' },
    { field: 'first_recharge_count', labelKey: 'firstRechargeDay' },
    { field: 'register_recharge_count', labelKey: 'registerRechargeDay' },
    { field: 'remark', labelKey: 'remark' },
    { field: 'create_time', labelKey: 'addedTime' },
    { field: 'uid', labelKey: 'UID' },
    { field: 'group_id', labelKey: 'groupId' }
  ],

  dashboard: [
    { field: 'label', labelKey: 'dbSale' },
    { field: 'ee88Username', labelKey: 'dbAgentLine' },
    { field: 'todayNewCustomers', labelKey: 'dbTodayNewCustomers' },
    { field: 'todayLotteryBet', labelKey: 'dbTodayLotteryBet' },
    { field: 'todayThirdBet', labelKey: 'dbTodayThirdBet' },
    { field: 'monthlyLotteryBet', labelKey: 'dbMonthlyLotteryBet' },
    { field: 'monthlyThirdBet', labelKey: 'dbMonthlyThirdBet' },
    { field: 'todayDeposit', labelKey: 'dbTodayDeposit' },
    { field: 'monthlyDeposit', labelKey: 'dbMonthlyDeposit' },
    { field: 'lotteryWL', labelKey: 'dbLotteryWLTotal' },
    { field: 'thirdWL', labelKey: 'dbThirdWLTotal' }
  ],

  agentReport: [
    { field: 'label', labelKey: 'dbSale' },
    { field: 'ee88Username', labelKey: 'dbAgentLine' },
    { field: 'todayNewCustomers', labelKey: 'dbTodayNewCustomers' },
    { field: 'todayLotteryBet', labelKey: 'dbTodayLotteryBet' },
    { field: 'todayThirdBet', labelKey: 'dbTodayThirdBet' },
    { field: 'monthlyLotteryBet', labelKey: 'dbMonthlyLotteryBet' },
    { field: 'monthlyThirdBet', labelKey: 'dbMonthlyThirdBet' },
    { field: 'todayDeposit', labelKey: 'dbTodayDeposit' },
    { field: 'monthlyDeposit', labelKey: 'dbMonthlyDeposit' },
    { field: 'lotteryWL', labelKey: 'dbLotteryWLTotal' },
    { field: 'thirdWL', labelKey: 'dbThirdWLTotal' }
  ],

  customerStatus: [
    { field: 'username', labelKey: 'userName' },
    { field: 'agentLabel', labelKey: 'agent' },
    { field: 'category', labelKey: 'csCategory' },
    { field: 'balance', labelKey: 'balance' },
    { field: 'depositMoney', labelKey: 'totalDeposit' },
    { field: 'withdrawalMoney', labelKey: 'totalWithdraw' },
    { field: 'lotteryWL', labelKey: 'dbLotteryWL' },
    { field: 'thirdWL', labelKey: 'dbThirdPartyWL' },
    { field: 'totalWL', labelKey: 'winLose' },
    { field: 'actualProfit', labelKey: 'csActualProfit' }
  ],

  customerRetention: [
    { field: 'label', labelKey: 'dbSale' },
    { field: 'ee88Username', labelKey: 'dbAgentLine' },
    { field: 'active', labelKey: 'crActive' },
    { field: 'newActive', labelKey: 'crNewActive' },
    { field: 'returning', labelKey: 'crReturning' },
    { field: 'churned', labelKey: 'crChurned' },
    { field: 'retentionRate', labelKey: 'crRetentionRate' }
  ],

  winLossStats: [
    { field: 'username', labelKey: 'userName' },
    { field: 'agentLabel', labelKey: 'agent' },
    { field: 'lotteryWL', labelKey: 'dbLotteryWL' },
    { field: 'thirdWL', labelKey: 'dbThirdPartyWL' },
    { field: 'totalWL', labelKey: 'winLose' },
    { field: 'customers', labelKey: 'wlTotalCustomers' },
    { field: 'winners', labelKey: 'wlWinners' },
    { field: 'losers', labelKey: 'wlLosers' },
    { field: 'totalWon', labelKey: 'wlTotalWon' },
    { field: 'totalLost', labelKey: 'wlTotalLost' },
    { field: 'companyProfit', labelKey: 'wlCompanyProfit' }
  ],

  providerAnalysis: [
    { field: 'platform_id_name', labelKey: 'paProvider' },
    { field: 'players', labelKey: 'paPlayers' },
    { field: 'betAmount', labelKey: 'paBetAmount' },
    { field: 'betTimes', labelKey: 'paBetTimes' },
    { field: 'winLose', labelKey: 'paWinLose' },
    { field: 'companyProfit', labelKey: 'paCompanyProfit' },
    { field: 'game_name', labelKey: 'paGameName' },
    { field: 'betCount', labelKey: 'paBetCount' }
  ],

  lotteryAnalysis: [
    { field: 'lottery_name', labelKey: 'laLotteryName' },
    { field: 'players', labelKey: 'laPlayers' },
    { field: 'betCount', labelKey: 'laBetCount' },
    { field: 'betAmount', labelKey: 'laBetAmount' },
    { field: 'validAmount', labelKey: 'laValidAmount' },
    { field: 'prize', labelKey: 'laPrize' },
    { field: 'rebateAmount', labelKey: 'laRebateAmount' },
    { field: 'winLose', labelKey: 'laWinLose' },
    { field: 'companyProfit', labelKey: 'laCompanyProfit' }
  ],

  depositWithdrawAnalysis: [
    { field: 'label', labelKey: 'dbSale' },
    { field: 'ee88Username', labelKey: 'dbAgentLine' },
    { field: 'deposit', labelKey: 'totalDeposit' },
    { field: 'withdrawal', labelKey: 'totalWithdraw' },
    { field: 'net', labelKey: 'dwNetAmount' },
    { field: 'promotion', labelKey: 'promotion' },
    { field: 'thirdRebate', labelKey: 'thirdRebate' }
  ],

  promotionAnalysis: [
    { field: 'label', labelKey: 'dbSale' },
    { field: 'ee88Username', labelKey: 'dbAgentLine' },
    { field: 'promotion', labelKey: 'promotion' },
    { field: 'thirdRebate', labelKey: 'thirdRebate' },
    { field: 'thirdActivity', labelKey: 'pmThirdActivity' },
    { field: 'totalDeposit', labelKey: 'totalDeposit' },
    { field: 'promoRate', labelKey: 'pmRate' }
  ],

  financialSummary: [
    { field: 'label', labelKey: 'dbSale' },
    { field: 'ee88Username', labelKey: 'dbAgentLine' },
    { field: 'lotteryWL', labelKey: 'fsLotteryWL' },
    { field: 'thirdWL', labelKey: 'fsThirdWL' },
    { field: 'promotion', labelKey: 'promotion' },
    { field: 'thirdRebate', labelKey: 'thirdRebate' },
    { field: 'revenue', labelKey: 'fsTotalRevenue' },
    { field: 'cost', labelKey: 'fsCost' },
    { field: 'profit', labelKey: 'fsProfit' },
    { field: 'margin', labelKey: 'fsMargin' }
  ],

  detailedGameStats: [
    { field: 'game_name', labelKey: 'dgGameName' },
    { field: 'platform_id_name', labelKey: 'dgProvider' },
    { field: 'players', labelKey: 'dgPlayers' },
    { field: 'betCount', labelKey: 'dgBetCount' },
    { field: 'betAmount', labelKey: 'dgBetAmount' },
    { field: 'turnover', labelKey: 'dgTurnover' },
    { field: 'prize', labelKey: 'dgPrize' },
    { field: 'winLose', labelKey: 'dgWinLose' },
    { field: 'companyProfit', labelKey: 'dgCompanyProfit' }
  ],

  qcGroupQuality: [
    { field: 'groupId', labelKey: 'qcGroup' },
    { field: 'members', labelKey: 'qcMembers' },
    { field: 'active', labelKey: 'qcActive' },
    { field: 'totalDeposit', labelKey: 'totalDeposit' },
    { field: 'lotteryBet', labelKey: 'dbLotteryBet' },
    { field: 'lotteryWL', labelKey: 'dbLotteryWL' },
    { field: 'thirdBet', labelKey: 'dbThirdBet' },
    { field: 'thirdWL', labelKey: 'dbThirdPartyWL' }
  ],

  revenueCalc: [
    { field: 'label', labelKey: 'dbSale' },
    { field: 'ee88Username', labelKey: 'dbAgentLine' },
    { field: 'lotteryWL', labelKey: 'revLotteryProfit' },
    { field: 'thirdWL', labelKey: 'revThirdProfit' },
    { field: 'promotion', labelKey: 'promotion' },
    { field: 'thirdRebate', labelKey: 'thirdRebate' },
    { field: 'revenue', labelKey: 'revenue' }
  ]
};

module.exports = COLUMN_REGISTRY;
