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
 *   --no-restart   Chỉ build, không restart server
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..', 'Project_EE88');
const DIST = path.join(ROOT, 'dist');
const PORT = 3001;
const NO_RESTART = process.argv.includes('--no-restart');

// ── Cấu hình copy ──
const SERVER_DIRS = ['config', 'database', 'middleware', 'routes', 'services', 'utils'];
const SERVER_FILES = ['server.js', 'package.json'];

const CLIENT_COPY = ['index.html', 'js', 'lib', 'pages', 'images'];

// ── Helper functions ──

/**
 * Tìm PID của process đang listen trên port
 * @returns {number|null}
 */
function findServerPID() {
  try {
    const output = execSync(`netstat -ano | findstr :${PORT} | findstr LISTENING`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    // Output format: "  TCP    0.0.0.0:3001    0.0.0.0:0    LISTENING    12345"
    const lines = output.trim().split('\n');
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      const pid = parseInt(parts[parts.length - 1], 10);
      if (pid && pid !== process.pid) return pid;
    }
  } catch (e) {
    // Không tìm thấy process nào
  }
  return null;
}

/**
 * Kill process theo PID
 */
function killProcess(pid) {
  try {
    execSync(`taskkill /PID ${pid} /F`, { stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Đợi cho process tắt hẳn
 */
function waitForExit(pid, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      const output = execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      if (output.includes('No tasks') || !output.includes(String(pid))) return true;
    } catch (e) {
      return true;
    }
    // Đợi 200ms rồi check lại
    execSync('ping -n 1 -w 200 127.0.0.1 > nul 2>&1', { stdio: 'ignore' });
  }
  return false;
}

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

// 1. Tìm và tắt server đang chạy
console.log('[1/6] Kiểm tra server đang chạy ...');
const serverPID = findServerPID();
let wasRunning = false;

if (serverPID) {
  console.log('  > Server đang chạy (PID: ' + serverPID + ')');
  console.log('  > Đang tắt server ...');
  killProcess(serverPID);
  waitForExit(serverPID);
  wasRunning = true;
  console.log('  > Server đã tắt');
} else {
  console.log('  > Không có server đang chạy');
}

// 2. Dọn dẹp dist/
console.log('[2/6] Dọn dẹp dist/ ...');
cleanDir(DIST);

// 3. Copy server files
console.log('[3/6] Copy server/ ...');
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

// 4. Tạo .env.example
console.log('[4/6] Tạo .env.example ...');
const envExample = [
  '# EE88 Agent Hub — Cấu hình môi trường',
  '# Copy file này thành .env và điền giá trị thực',
  '',
  'PORT=3001',
  'JWT_SECRET=your-secret-key-here',
  'JWT_EXPIRES_IN=24h',
  '',
  '# Agent EE88 mặc định (sẽ tự migrate vào DB lần đầu)',
  'EE88_BASE_URL=https://example.com',
  'EE88_COOKIE=PHPSESSID=your_session_id_here',
  ''
].join('\n');
fs.writeFileSync(path.join(serverDest, '.env.example'), envExample);
console.log('  + server/.env.example');

// 5. Copy client files
console.log('[5/6] Copy client/ ...');
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

// 6. Thống kê + Restart
console.log('[6/6] Thống kê ...');
const serverCount = countFiles(serverDest);
const clientCount = countFiles(clientDest);
console.log('');
console.log('=== Build hoàn tất ===');
console.log('  Output:  ' + DIST);
console.log('  Server:  ' + serverCount + ' files');
console.log('  Client:  ' + clientCount + ' files');
console.log('  Tổng:    ' + (serverCount + clientCount) + ' files');
console.log('');

// Auto-restart server
if (NO_RESTART) {
  console.log('  (--no-restart: Bỏ qua restart server)');
  console.log('');
} else if (wasRunning || !NO_RESTART) {
  // Kiểm tra node_modules và .env tồn tại trong dist
  const hasNodeModules = fs.existsSync(path.join(serverDest, 'node_modules'));
  const hasEnv = fs.existsSync(path.join(serverDest, '.env'));

  if (!hasNodeModules) {
    console.log('  ! Chưa có node_modules trong dist/server/');
    console.log('    Chạy: cd dist/server && npm install --production');
    console.log('');
  } else if (!hasEnv) {
    console.log('  ! Chưa có .env trong dist/server/');
    console.log('    Copy .env.example → .env và điền giá trị thực');
    console.log('');
  } else {
    console.log('  > Đang khởi động lại server ...');
    console.log('  > http://localhost:' + PORT);
    console.log('');
    const child = spawn('node', ['server.js'], {
      cwd: serverDest,
      stdio: 'inherit'
    });
    child.on('exit', function (code) {
      process.exit(code);
    });
  }
}
