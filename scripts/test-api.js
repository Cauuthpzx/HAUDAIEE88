/**
 * Script test API ee88 — Phase 1
 *
 * Cách dùng:
 *   node scripts/test-api.js <PHPSESSID>
 *   node scripts/test-api.js <PHPSESSID> members
 *   node scripts/test-api.js <PHPSESSID> all
 */

const axios = require('axios');

const BASE_URL = 'https://a2u4k.ee88dly.com';

const ENDPOINTS = {
  members: {
    url: '/agent/user.html',
    params: { page: 1, limit: 5 },
    description: 'Danh sách hội viên'
  },
  invites: {
    url: '/agent/inviteList.html',
    params: { page: 1, limit: 5 },
    description: 'Mã mời'
  },
  banks: {
    url: '/agent/bankList.html',
    params: { page: 1, limit: 5 },
    description: 'Thẻ ngân hàng'
  },
  rebate: {
    url: '/agent/getRebateOddsPanel.html',
    params: {},
    description: 'Bảng hoàn trả (success code = 1)',
    successCode: 1
  },
  'report-lottery': {
    url: '/agent/reportLottery.html',
    params: { page: 1, limit: 5, date: getTodayRange() },
    description: 'Báo cáo xổ số'
  },
  'report-funds': {
    url: '/agent/reportFunds.html',
    params: { page: 1, limit: 5, date: getTodayRange() },
    description: 'Sao kê giao dịch'
  },
  'report-third': {
    url: '/agent/reportThirdGame.html',
    params: { page: 1, limit: 5, date: getTodayRange() },
    description: 'Báo cáo nhà cung cấp game'
  },
  deposits: {
    url: '/agent/depositAndWithdrawal.html',
    params: { page: 1, limit: 5, create_time: getTodayRange() },
    description: 'Nạp/Rút tiền'
  },
  withdrawals: {
    url: '/agent/withdrawalsRecord.html',
    params: { page: 1, limit: 5, create_time: getTodayRange() },
    description: 'Lịch sử rút tiền'
  },
  bets: {
    url: '/agent/bet.html',
    params: { page: 1, limit: 5, create_time: getTodayRange() },
    description: 'Đơn cược xổ số'
  },
  'bet-orders': {
    url: '/agent/betOrder.html',
    params: { page: 1, limit: 5, bet_time: getTodayRange() },
    description: 'Đơn cược bên thứ 3'
  }
};

function getTodayRange() {
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${today} | ${today}`;
}

function buildQS(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function testEndpoint(cookie, key, cfg) {
  const qs = buildQS(cfg.params);
  const url = qs ? `${BASE_URL}${cfg.url}?${qs}` : `${BASE_URL}${cfg.url}`;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[${key}] ${cfg.description}`);
  console.log(`POST ${cfg.url}  params: ${JSON.stringify(cfg.params)}`);
  console.log('-'.repeat(60));

  try {
    const res = await axios({
      method: 'POST',
      url,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Cookie: `PHPSESSID=${cookie}`
      },
      timeout: 15000,
      validateStatus: () => true
    });

    const body = res.data;

    if (body && body.url === '/agent/login') {
      console.log('SESSION EXPIRED!');
      return false;
    }

    const ok = body && body.code === (cfg.successCode || 0);
    if (ok) {
      const rows = Array.isArray(body.data) ? body.data.length : '(not array)';
      console.log(`OK — code:${body.code} count:${body.count || 'N/A'} rows:${rows}`);
      if (Array.isArray(body.data) && body.data[0]) {
        console.log(`Fields: ${Object.keys(body.data[0]).join(', ')}`);
        console.log(`Sample: ${JSON.stringify(body.data[0]).substring(0, 300)}`);
      }
      if (body.total_data) console.log('total_data:', JSON.stringify(body.total_data));
      if (body.form_data) console.log('form_data:', JSON.stringify(body.form_data));
    } else {
      console.log(`FAIL — code:${body ? body.code : 'null'} msg:${body ? body.msg : 'no response'}`);
    }
    return true;
  } catch (err) {
    console.log(`ERROR — ${err.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log('Usage:');
    console.log('  node scripts/test-api.js <PHPSESSID>              # test members');
    console.log('  node scripts/test-api.js <PHPSESSID> <endpoint>   # test 1');
    console.log('  node scripts/test-api.js <PHPSESSID> all          # test all');
    console.log('\nEndpoints:');
    for (const [k, c] of Object.entries(ENDPOINTS)) console.log(`  ${k.padEnd(20)} ${c.description}`);
    process.exit(0);
  }

  const cookie = args[0];
  const target = args[1] || 'members';

  console.log(`Base: ${BASE_URL}  Session: ${cookie.substring(0, 8)}...  Date: ${getTodayRange()}`);

  if (target === 'all') {
    let ok = 0, fail = 0;
    for (const [k, c] of Object.entries(ENDPOINTS)) {
      (await testEndpoint(cookie, k, c)) ? ok++ : fail++;
      await new Promise(r => setTimeout(r, 500));
    }
    console.log(`\n${'='.repeat(60)}\nRESULT: ${ok} OK / ${fail} FAIL / ${Object.keys(ENDPOINTS).length} total`);
  } else {
    if (!ENDPOINTS[target]) { console.error(`Unknown: "${target}". Valid: ${Object.keys(ENDPOINTS).join(', ')}`); process.exit(1); }
    await testEndpoint(cookie, target, ENDPOINTS[target]);
  }
}

main().catch(console.error);
