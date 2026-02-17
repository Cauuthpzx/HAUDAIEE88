/**
 * Build script — Đóng gói project vào thư mục dist/
 *
 * Cấu trúc output:
 *   dist/
 *   ├── server/          (backend)
 *   │   ├── server.js
 *   │   ├── package.json
 *   │   ├── config/
 *   │   ├── routes/
 *   │   ├── services/
 *   │   ├── utils/
 *   │   └── .env.example
 *   └── client/          (frontend)
 *       ├── index.html
 *       ├── js/
 *       ├── lib/
 *       └── pages/
 *
 * Sử dụng: node scripts/build.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'Project_EE88');
const DIST = path.join(ROOT, 'dist');

// ── Cấu hình copy ──
const SERVER_DIRS = ['config', 'routes', 'services', 'utils'];
const SERVER_FILES = ['server.js', 'package.json'];

const CLIENT_COPY = ['index.html', 'js', 'lib', 'pages'];

// ── Helper functions ──
function cleanDir(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.mkdirSync(dir, { recursive: true });
}

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      // Bỏ qua node_modules, logs, .env
      if (entry === 'node_modules' || entry === 'logs' || entry === '.env') continue;
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function countFiles(dir) {
  let count = 0;
  if (!fs.existsSync(dir)) return 0;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      count += countFiles(path.join(dir, entry.name));
    } else {
      count++;
    }
  }
  return count;
}

// ── Main ──
console.log('');
console.log('=== EE88 Agent Hub — Build ===');
console.log('');

// 1. Dọn dẹp dist/
console.log('[1/5] Dọn dẹp dist/ ...');
cleanDir(DIST);

// 2. Copy server files
console.log('[2/5] Copy server/ ...');
const serverSrc = path.join(ROOT, 'server');
const serverDest = path.join(DIST, 'server');
fs.mkdirSync(serverDest, { recursive: true });

for (const file of SERVER_FILES) {
  const src = path.join(serverSrc, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, path.join(serverDest, file));
    console.log('  + server/' + file);
  }
}

for (const dir of SERVER_DIRS) {
  const src = path.join(serverSrc, dir);
  if (fs.existsSync(src)) {
    copyRecursive(src, path.join(serverDest, dir));
    console.log('  + server/' + dir + '/');
  }
}

// 3. Tạo .env.example
console.log('[3/5] Tạo .env.example ...');
const envExample = [
  '# EE88 Agent Hub — Cấu hình môi trường',
  '# Copy file này thành .env và điền giá trị thực',
  '',
  'PORT=3001',
  'EE88_BASE_URL=https://example.com',
  'EE88_COOKIE=PHPSESSID=your_session_id_here',
  ''
].join('\n');
fs.writeFileSync(path.join(serverDest, '.env.example'), envExample);
console.log('  + server/.env.example');

// 4. Copy client files
console.log('[4/5] Copy client/ ...');
const clientSrc = path.join(ROOT, 'client');
const clientDest = path.join(DIST, 'client');
fs.mkdirSync(clientDest, { recursive: true });

for (const item of CLIENT_COPY) {
  const src = path.join(clientSrc, item);
  if (fs.existsSync(src)) {
    const dest = path.join(clientDest, item);
    copyRecursive(src, dest);
    const stat = fs.statSync(src);
    console.log('  + client/' + item + (stat.isDirectory() ? '/' : ''));
  }
}

// 5. Thống kê
console.log('[5/5] Thống kê ...');
const serverCount = countFiles(serverDest);
const clientCount = countFiles(clientDest);
console.log('');
console.log('=== Build hoàn tất ===');
console.log('  Output:  ' + DIST);
console.log('  Server:  ' + serverCount + ' files');
console.log('  Client:  ' + clientCount + ' files');
console.log('  Tổng:    ' + (serverCount + clientCount) + ' files');
console.log('');
console.log('Bước tiếp theo:');
console.log('  1. cd dist/server');
console.log('  2. npm install --production');
console.log('  3. Copy .env.example → .env (điền giá trị thực)');
console.log('  4. node server.js');
console.log('');
