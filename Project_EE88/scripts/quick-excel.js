/**
 * Quick export ee88 sample data to Excel (5 rows each, parallel fetch)
 * Usage: node Project_EE88/scripts/quick-excel.js "<cookie>"
 */
const axios = require('axios');
const XLSX = require('xlsx');
const path = require('path');

const BASE = 'https://a2u4k.ee88dly.com';
const CK = process.argv[2] || '';
if (!CK) { console.log('Usage: node quick-excel.js "<cookie>"'); process.exit(1); }

const d = new Date();
const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const dr = `${today} | ${today}`;

const EPS = [
  { key: 'members',        url: '/agent/user.html',                  p: {page:1,limit:5},                  sc: 0, label: 'Hội viên' },
  { key: 'invites',        url: '/agent/inviteList.html',            p: {page:1,limit:5},                  sc: 0, label: 'Mã mời' },
  { key: 'banks',          url: '/agent/bankList.html',              p: {page:1,limit:5},                  sc: 0, label: 'Thẻ NH' },
  { key: 'report-lottery', url: '/agent/reportLottery.html',         p: {page:1,limit:5,date:dr},          sc: 0, label: 'BC Xổ số' },
  { key: 'report-funds',   url: '/agent/reportFunds.html',           p: {page:1,limit:5,date:dr},          sc: 0, label: 'Sao kê GD' },
  { key: 'report-third',   url: '/agent/reportThirdGame.html',       p: {page:1,limit:5,date:dr},          sc: 0, label: 'BC Game 3rd' },
  { key: 'deposits',       url: '/agent/depositAndWithdrawal.html',  p: {page:1,limit:5,create_time:dr},   sc: 0, label: 'Nạp Rút' },
  { key: 'withdrawals',    url: '/agent/withdrawalsRecord.html',     p: {page:1,limit:5,create_time:dr},   sc: 0, label: 'Lịch sử rút' },
  { key: 'bets',           url: '/agent/bet.html',                   p: {page:1,limit:5,create_time:dr},   sc: 0, label: 'Cược XS' },
  { key: 'bet-orders',     url: '/agent/betOrder.html',              p: {page:1,limit:5,bet_time:dr},      sc: 0, label: 'Cược 3rd' },
];

function qs(p) {
  return Object.entries(p).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

async function fetch1(ep) {
  const url = `${BASE}${ep.url}?${qs(ep.p)}`;
  try {
    const r = await axios({ method:'POST', url, headers:{ 'X-Requested-With':'XMLHttpRequest', 'User-Agent':'Mozilla/5.0', Cookie:CK }, timeout:30000, validateStatus:()=>true });
    const b = r.data;
    if (b && b.url==='/agent/login') return { key:ep.key, label:ep.label, data:[], count:0, err:'SESSION EXPIRED' };
    if (b && b.code===ep.sc && Array.isArray(b.data)) return { key:ep.key, label:ep.label, data:b.data, count:b.count||b.data.length, total_data:b.total_data, form_data:b.form_data };
    return { key:ep.key, label:ep.label, data:[], count:0, err:`code:${b?.code} ${b?.msg||''}` };
  } catch(e) { return { key:ep.key, label:ep.label, data:[], count:0, err:e.message }; }
}

function makeSheet(result) {
  if (!result.data.length) return XLSX.utils.aoa_to_sheet([['Không có dữ liệu']]);
  const fields = Object.keys(result.data[0]);
  // Row 1: field names
  // Row 2+: values
  const aoa = [fields];
  for (const row of result.data) {
    aoa.push(fields.map(f => {
      let v = row[f];
      if (typeof v === 'object' && v !== null) v = JSON.stringify(v);
      return v;
    }));
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = fields.map((f, i) => {
    let w = f.length;
    for (const r of aoa.slice(1)) { const l = String(r[i]||'').length; if (l > w) w = l; }
    return { wch: Math.min(w + 2, 40) };
  });
  return ws;
}

(async () => {
  console.log(`Fetching 10 endpoints (5 rows each)...`);
  const results = await Promise.all(EPS.map(ep => fetch1(ep)));

  const wb = XLSX.utils.book_new();

  // Summary sheet
  const sum = [
    ['EE88 Agent — Data Sample'],
    ['Ngày', today],
    ['Ghi chú', 'Cookie đại lí cũ — mẫu 5 dòng mỗi endpoint'],
    [],
    ['Sheet', 'Endpoint', 'Tổng rows', 'Mẫu', 'Trạng thái']
  ];

  for (const r of results) {
    const st = r.err ? `LỖI: ${r.err}` : 'OK';
    sum.push([r.label, r.key, r.count, r.data.length, st]);
    console.log(`  ${r.label.padEnd(14)} ${r.data.length}/${r.count} — ${st}`);
    const ws = makeSheet(r);
    XLSX.utils.book_append_sheet(wb, ws, r.label.substring(0, 31));
  }

  const sumWs = XLSX.utils.aoa_to_sheet(sum);
  sumWs['!cols'] = [{wch:14},{wch:16},{wch:10},{wch:8},{wch:20}];
  wb.SheetNames.unshift('Tổng hợp');
  wb.Sheets['Tổng hợp'] = sumWs;

  const outFile = path.resolve(__dirname, '..', `ee88_sample_${today}.xlsx`);
  XLSX.writeFile(wb, outFile);
  console.log(`\nDone! File: ${outFile}`);
})();
