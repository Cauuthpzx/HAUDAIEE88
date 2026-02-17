/**
 * Test all 11 ee88 endpoints with full cookies
 */
const axios = require('axios');

const BASE_URL = 'https://a2u4k.ee88dly.com';
const COOKIE = process.argv[2] || '';

if (!COOKIE) {
  console.log('Usage: node test-full.js "<full cookie string>"');
  process.exit(1);
}

const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dateRange = `${today} | ${today}`;

const ENDPOINTS = {
  members:          { url: '/agent/user.html', params: { page: 1, limit: 5 }, sc: 0 },
  invites:          { url: '/agent/inviteList.html', params: { page: 1, limit: 5 }, sc: 0 },
  banks:            { url: '/agent/bankList.html', params: { page: 1, limit: 5 }, sc: 0 },
  rebate:           { url: '/agent/getRebateOddsPanel.html', params: {}, sc: 1 },
  'report-lottery': { url: '/agent/reportLottery.html', params: { page: 1, limit: 5, date: dateRange }, sc: 0 },
  'report-funds':   { url: '/agent/reportFunds.html', params: { page: 1, limit: 5, date: dateRange }, sc: 0 },
  'report-third':   { url: '/agent/reportThirdGame.html', params: { page: 1, limit: 5, date: dateRange }, sc: 0 },
  deposits:         { url: '/agent/depositAndWithdrawal.html', params: { page: 1, limit: 5, create_time: dateRange }, sc: 0 },
  withdrawals:      { url: '/agent/withdrawalsRecord.html', params: { page: 1, limit: 5, create_time: dateRange }, sc: 0 },
  bets:             { url: '/agent/bet.html', params: { page: 1, limit: 5, create_time: dateRange }, sc: 0 },
  'bet-orders':     { url: '/agent/betOrder.html', params: { page: 1, limit: 5, bet_time: dateRange }, sc: 0 }
};

function buildQS(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

async function test(key, cfg) {
  const qs = buildQS(cfg.params);
  const url = qs ? `${BASE_URL}${cfg.url}?${qs}` : `${BASE_URL}${cfg.url}`;
  try {
    const res = await axios({
      method: 'POST',
      url,
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Cookie: COOKIE
      },
      timeout: 30000,
      validateStatus: () => true
    });
    const b = res.data;
    if (b && b.url === '/agent/login') return `${key.padEnd(16)} SESSION EXPIRED!`;
    const ok = b && b.code === cfg.sc;
    if (ok) {
      const rows = Array.isArray(b.data) ? b.data.length : '(obj)';
      return `${key.padEnd(16)} OK   count:${String(b.count || '-').padEnd(7)} rows:${rows}`;
    }
    return `${key.padEnd(16)} FAIL code:${b ? b.code : 'null'} msg:${b ? b.msg : 'none'}`;
  } catch (e) {
    return `${key.padEnd(16)} ERR  ${e.message}`;
  }
}

(async () => {
  console.log(`Cookie: ${COOKIE.substring(0, 40)}...`);
  console.log(`Date: ${dateRange}`);
  console.log('='.repeat(60));

  let ok = 0, fail = 0;
  for (const [k, c] of Object.entries(ENDPOINTS)) {
    const r = await test(k, c);
    console.log(r);
    r.includes(' OK ') ? ok++ : fail++;
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  console.log('='.repeat(60));
  console.log(`RESULT: ${ok} OK / ${fail} FAIL / 11 total`);
})();
