/**
 * Export ee88 API data to Excel
 * Usage: node Project_EE88/scripts/export-excel.js "<full cookie string>"
 */
const axios = require('axios');
const XLSX = require('xlsx');
const path = require('path');

const BASE_URL = 'https://a2u4k.ee88dly.com';
const COOKIE = process.argv[2] || '';

if (!COOKIE) {
  console.log('Usage: node Project_EE88/scripts/export-excel.js "<full cookie string>"');
  process.exit(1);
}

const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateRange = `${today} | ${today}`;
const LIMIT = parseInt(process.argv[3]) || 10; // default 10 rows, pass number as 3rd arg
const timestamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;

const ENDPOINTS = {
  members:          { url: '/agent/user.html', params: { page: 1, limit: LIMIT }, sc: 0, label: 'Hội viên' },
  invites:          { url: '/agent/inviteList.html', params: { page: 1, limit: LIMIT }, sc: 0, label: 'Mã mời' },
  banks:            { url: '/agent/bankList.html', params: { page: 1, limit: LIMIT }, sc: 0, label: 'Thẻ NH' },
  'report-lottery': { url: '/agent/reportLottery.html', params: { page: 1, limit: LIMIT, date: dateRange }, sc: 0, label: 'BC Xổ số' },
  'report-funds':   { url: '/agent/reportFunds.html', params: { page: 1, limit: LIMIT, date: dateRange }, sc: 0, label: 'Sao kê GD' },
  'report-third':   { url: '/agent/reportThirdGame.html', params: { page: 1, limit: LIMIT, date: dateRange }, sc: 0, label: 'BC Game 3rd' },
  deposits:         { url: '/agent/depositAndWithdrawal.html', params: { page: 1, limit: LIMIT, create_time: dateRange }, sc: 0, label: 'Nạp Rút' },
  withdrawals:      { url: '/agent/withdrawalsRecord.html', params: { page: 1, limit: LIMIT, create_time: dateRange }, sc: 0, label: 'Lịch sử rút' },
  bets:             { url: '/agent/bet.html', params: { page: 1, limit: LIMIT, create_time: dateRange }, sc: 0, label: 'Cược XS' },
  'bet-orders':     { url: '/agent/betOrder.html', params: { page: 1, limit: LIMIT, bet_time: dateRange }, sc: 0, label: 'Cược 3rd' }
};

// Cột hiển thị cho từng endpoint
const COLUMNS = {
  members: [
    { key: 'uid', header: 'UID' },
    { key: 'username', header: 'Tài khoản' },
    { key: 'truename', header: 'Họ tên' },
    { key: 'phone', header: 'SĐT' },
    { key: 'money', header: 'Số dư' },
    { key: 'deposit_count', header: 'Số lần nạp' },
    { key: 'deposit_amount', header: 'Tổng nạp' },
    { key: 'withdrawal_count', header: 'Số lần rút' },
    { key: 'withdrawal_amount', header: 'Tổng rút' },
    { key: 'status_format', header: 'Trạng thái' },
    { key: 'type_format', header: 'Loại' },
    { key: 'parent_user', header: 'Agent' },
    { key: 'invite_code', header: 'Mã mời' },
    { key: 'login_time', header: 'Login cuối' },
    { key: 'register_time', header: 'Ngày ĐK' },
    { key: 'first_deposit_time', header: 'Nạp lần đầu' },
    { key: 'login_ip', header: 'IP Login' },
    { key: 'register_ip', header: 'IP ĐK' }
  ],
  invites: [
    { key: 'id', header: 'ID' },
    { key: 'uid', header: 'UID' },
    { key: 'invite_code', header: 'Mã mời' },
    { key: 'user_type', header: 'Loại user' },
    { key: 'reg_count', header: 'Số ĐK' },
    { key: 'recharge_count', header: 'Số nạp' },
    { key: 'first_recharge_count', header: 'Nạp lần đầu' },
    { key: 'register_recharge_count', header: 'ĐK+Nạp' },
    { key: 'scope_reg_count', header: 'Phạm vi ĐK' },
    { key: 'remark', header: 'Ghi chú' },
    { key: 'create_time', header: 'Ngày tạo' }
  ],
  banks: [
    { key: 'id', header: 'ID' },
    { key: 'bank', header: 'Ngân hàng' },
    { key: 'branch', header: 'Chi nhánh' },
    { key: 'card_number', header: 'Số thẻ' },
    { key: 'is_default', header: 'Mặc định' },
    { key: 'create_time', header: 'Ngày tạo' }
  ],
  'report-lottery': [
    { key: 'username', header: 'Tài khoản' },
    { key: 'user_parent_format', header: 'Agent' },
    { key: 'lottery_name', header: 'Xổ số' },
    { key: 'bet_count', header: 'Số cược' },
    { key: 'bet_amount', header: 'Tiền cược' },
    { key: 'valid_amount', header: 'Cược hợp lệ' },
    { key: 'rebate_amount', header: 'Hoàn trả' },
    { key: 'prize', header: 'Trúng thưởng' },
    { key: 'win_lose', header: 'Thắng/Thua' },
    { key: 'result', header: 'Kết quả' }
  ],
  'report-funds': [
    { key: 'username', header: 'Tài khoản' },
    { key: 'user_parent_format', header: 'Agent' },
    { key: 'date', header: 'Ngày' },
    { key: 'deposit_count', header: 'Số lần nạp' },
    { key: 'deposit_amount', header: 'Tổng nạp' },
    { key: 'withdrawal_count', header: 'Số lần rút' },
    { key: 'withdrawal_amount', header: 'Tổng rút' },
    { key: 'charge_fee', header: 'Phí' },
    { key: 'agent_commission', header: 'Hoa hồng' },
    { key: 'promotion', header: 'Khuyến mãi' },
    { key: 'third_rebate', header: 'Hoàn trả 3rd' },
    { key: 'third_activity_amount', header: 'HĐ 3rd' }
  ],
  'report-third': [
    { key: 'username', header: 'Tài khoản' },
    { key: 'platform_id_name', header: 'Nhà cung cấp' },
    { key: 't_bet_times', header: 'Số lượt' },
    { key: 't_bet_amount', header: 'Tiền cược' },
    { key: 't_turnover', header: 'Doanh thu' },
    { key: 't_prize', header: 'Trúng thưởng' },
    { key: 't_win_lose', header: 'Thắng/Thua' }
  ],
  deposits: [
    { key: 'serial_no', header: 'Mã GD' },
    { key: 'username', header: 'Tài khoản' },
    { key: 'user_parent_format', header: 'Agent' },
    { key: 'type', header: 'Loại', fmt: v => v === '1' ? 'Nạp' : 'Rút' },
    { key: 'amount', header: 'Số tiền' },
    { key: 'true_amount', header: 'Thực nhận' },
    { key: 'firm_fee', header: 'Phí sàn' },
    { key: 'user_fee', header: 'Phí user' },
    { key: 'status', header: 'Trạng thái', fmt: v => ({ 0: 'Chờ', 1: 'Hoàn tất', 2: 'Đang xử lí', 3: 'Thất bại' })[v] || v },
    { key: 'name', header: 'Tên TK' },
    { key: 'account', header: 'Số TK' },
    { key: 'branch', header: 'Ngân hàng' },
    { key: 'create_time', header: 'Thời gian tạo' },
    { key: 'success_time', header: 'Thời gian HT' }
  ],
  withdrawals: [
    { key: 'serial_no', header: 'Mã GD' },
    { key: 'username', header: 'Tài khoản' },
    { key: 'user_parent_format', header: 'Agent' },
    { key: 'amount', header: 'Số tiền' },
    { key: 'true_amount', header: 'Thực nhận' },
    { key: 'user_fee', header: 'Phí' },
    { key: 'status_format', header: 'Trạng thái' },
    { key: 'name', header: 'Tên TK' },
    { key: 'account', header: 'Số TK' },
    { key: 'branch', header: 'Ngân hàng' },
    { key: 'create_time', header: 'Thời gian tạo' },
    { key: 'success_time', header: 'Thời gian HT' }
  ],
  bets: [
    { key: 'serial_no', header: 'Mã đơn' },
    { key: 'username', header: 'Tài khoản' },
    { key: 'lottery_name', header: 'Xổ số' },
    { key: 'play_type_name', header: 'Kiểu chơi' },
    { key: 'play_name', header: 'Loại cược' },
    { key: 'issue', header: 'Kỳ' },
    { key: 'content', header: 'Nội dung' },
    { key: 'money', header: 'Tiền cược' },
    { key: 'odds', header: 'Tỷ lệ' },
    { key: 'rebate', header: 'Hoàn trả' },
    { key: 'rebate_amount', header: 'Tiền HT' },
    { key: 'prize', header: 'Trúng thưởng' },
    { key: 'result', header: 'Kết quả' },
    { key: 'status_text', header: 'Trạng thái' },
    { key: 'create_time', header: 'Thời gian' }
  ],
  'bet-orders': [
    { key: 'serial_no', header: 'Mã đơn' },
    { key: 'platform_username', header: 'Tài khoản' },
    { key: 'platform_id_name', header: 'Nhà cung cấp' },
    { key: 'c_name', header: 'Loại game' },
    { key: 'game_name', header: 'Tên game' },
    { key: 'bet_amount', header: 'Tiền cược' },
    { key: 'turnover', header: 'Doanh thu' },
    { key: 'prize', header: 'Trúng thưởng' },
    { key: 'win_lose', header: 'Thắng/Thua' },
    { key: 'bet_time', header: 'Thời gian' }
  ]
};

function buildQS(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function fetchAll(key, cfg) {
  const allData = [];
  let page = 1;
  let totalCount = 0;

  while (true) {
    const params = { ...cfg.params, page, limit: LIMIT };
    const qs = buildQS(params);
    const url = `${BASE_URL}${cfg.url}?${qs}`;

    try {
      const res = await axios({
        method: 'POST', url,
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Cookie: COOKIE
        },
        timeout: 60000,
        validateStatus: () => true
      });

      const b = res.data;
      if (!b || b.url === '/agent/login') {
        console.log(`  [${key}] SESSION EXPIRED!`);
        return { data: [], count: 0, total_data: null };
      }

      if (b.code !== cfg.sc) {
        console.log(`  [${key}] FAIL code:${b.code} msg:${b.msg}`);
        return { data: [], count: 0, total_data: null };
      }

      if (!Array.isArray(b.data)) {
        return { data: [], count: 0, total_data: b.total_data || null };
      }

      totalCount = b.count || b.data.length;
      allData.push(...b.data);

      if (allData.length >= totalCount || b.data.length < LIMIT) break;
      page++;
      await new Promise(r => setTimeout(r, 300));
    } catch (e) {
      console.log(`  [${key}] ERROR page ${page}: ${e.message}`);
      break;
    }
  }

  return { data: allData, count: totalCount, total_data: null };
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return v;
  const n = parseFloat(v);
  return isNaN(n) ? v : n;
}

function buildSheet(key, rows) {
  const cols = COLUMNS[key];
  if (!cols || rows.length === 0) {
    return XLSX.utils.aoa_to_sheet([['Không có dữ liệu']]);
  }

  // Row 1: Tên cột tiếng Việt
  const headerVi = cols.map(c => c.header);
  // Row 2: Tên field API gốc
  const headerField = cols.map(c => c.key);
  const aoa = [headerVi, headerField];

  // Data rows
  for (const row of rows) {
    const line = cols.map(c => {
      let val = row[c.key];
      if (c.fmt) val = c.fmt(val);
      // Convert money strings to numbers
      if (typeof val === 'string' && /^-?\d+(\.\d+)?$/.test(val)) {
        val = toNumber(val);
      }
      // Stringify objects
      if (typeof val === 'object' && val !== null) {
        val = JSON.stringify(val);
      }
      return val;
    });
    aoa.push(line);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Auto column widths
  const colWidths = cols.map((c, i) => {
    let maxLen = Math.max(c.header.length, c.key.length);
    for (const r of aoa.slice(2)) {
      const cellLen = String(r[i] || '').length;
      if (cellLen > maxLen) maxLen = cellLen;
    }
    return { wch: Math.min(maxLen + 2, 45) };
  });
  ws['!cols'] = colWidths;

  return ws;
}

(async () => {
  console.log(`\nEE88 Data Export — ${today}`);
  console.log('='.repeat(50));

  const wb = XLSX.utils.book_new();

  // Summary sheet data
  const summary = [
    ['EE88 Agent Data Export'],
    ['Ngày xuất', today],
    ['Thời gian', new Date().toLocaleString('vi-VN')],
    [],
    ['Endpoint', 'Tổng rows', 'Đã tải', 'Trạng thái']
  ];

  for (const [key, cfg] of Object.entries(ENDPOINTS)) {
    process.stdout.write(`  ${cfg.label.padEnd(14)} ...`);

    const result = await fetchAll(key, cfg);
    const status = result.data.length > 0 ? 'OK' : (result.count === 0 ? 'Trống' : 'Lỗi');

    console.log(` ${result.data.length}/${result.count} rows — ${status}`);
    summary.push([cfg.label, result.count, result.data.length, status]);

    // Add sheet
    const sheetName = cfg.label.substring(0, 31); // Excel max 31 chars
    const ws = buildSheet(key, result.data);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    await new Promise(r => setTimeout(r, 200));
  }

  // Add summary as first sheet
  const summaryWs = XLSX.utils.aoa_to_sheet(summary);
  summaryWs['!cols'] = [{ wch: 18 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];

  // Insert summary at the beginning
  wb.SheetNames.unshift('Tổng hợp');
  wb.Sheets['Tổng hợp'] = summaryWs;

  // Save
  const outFile = path.join(__dirname, '..', `ee88_data_${timestamp}.xlsx`);
  XLSX.writeFile(wb, outFile);

  console.log('='.repeat(50));
  console.log(`Saved: ${outFile}`);
})();
