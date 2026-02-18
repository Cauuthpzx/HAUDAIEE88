require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const compression = require('compression');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const { createLogger, accessLogStream, LOG_DIR, cleanOldLogs } = require('./utils/logger');
const config = require('./config/default');
const { getDb, closeDb } = require('./database/init');
const proxyRoutes = require('./routes/proxy');
const actionRoutes = require('./routes/action');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const syncRoutes = require('./routes/sync');
const dashboardRoutes = require('./routes/dashboard');
const errorHandler = require('./middleware/errorHandler');

const log = createLogger('server');
const app = express();
const PORT = process.env.PORT || 3001;

// ── Config validation ──
if (config.jwt.secret === 'agent-hub-secret-change-me') {
  const newSecret = crypto.randomBytes(32).toString('hex');
  config.jwt.secret = newSecret;
  log.warn('JWT_SECRET chưa thay đổi! Đã sinh secret tạm thời.');
  log.warn('Hãy đặt JWT_SECRET trong .env để token ổn định qua các lần restart.');
}

// ── Dọn log cũ ──
cleanOldLogs(config.logging.retentionDays);

// ── Khởi tạo database ──
const db = getDb();
log.ok('Database đã khởi tạo');

// ── Security Middleware ──
app.use(helmet({
  contentSecurityPolicy: false,       // Tắt CSP — Layui dùng inline scripts/styles
  crossOriginEmbedderPolicy: false
}));

app.use(cors());

// ── Rate Limiting ──
app.use('/api/', rateLimit({
  windowMs: config.security.rateLimit.windowMs,
  max: config.security.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: -1, msg: 'Quá nhiều yêu cầu, vui lòng thử lại sau' }
}));

app.use('/api/auth/login', rateLimit({
  windowMs: config.security.authRateLimit.windowMs,
  max: config.security.authRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: -1, msg: 'Quá nhiều lần thử đăng nhập, vui lòng đợi 15 phút' }
}));

// Morgan: console dùng format 'dev', file dùng format 'combined'
app.use(morgan('dev'));
app.use(morgan('[:date[iso]] :method :url :status :res[content-length] - :response-time ms ":user-agent"', {
  stream: accessLogStream
}));

app.use(express.json({ limit: config.security.bodyLimit }));

// ── Routes ──
// Auth: không cần JWT
app.use('/api/auth', authRoutes);

// Data + Action: cần JWT + permission
app.use('/api/data', proxyRoutes);
app.use('/api/action', actionRoutes);

// Dashboard: cần JWT + permission (hiển thị cho tất cả users)
app.use('/api/dashboard', dashboardRoutes);

// Admin: cần JWT + admin role
app.use('/api/admin', adminRoutes);

// Sync: cần JWT + admin role
app.use('/api/admin', syncRoutes);

app.get('/api/health', (req, res) => {
  const agentCount = db.prepare('SELECT COUNT(*) as cnt FROM ee88_agents WHERE status = 1').get().cnt;
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM hub_users WHERE status = 1').get().cnt;
  log.ok('Kiểm tra sức khoẻ: OK');
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    agents: agentCount,
    users: userCount
  });
});

// ── Nén response (gzip) ──
app.use(compression({ threshold: 1024 }));

// ── Phục vụ file tĩnh từ client/ ──
const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir, { maxAge: '7d', etag: true }));
log.info(`Thư mục client: ${clientDir}`);

// ── Phục vụ SPA từ spa/ (truy cập qua /spa/) ──
const spaDir = path.join(__dirname, '..', 'spa');
if (fs.existsSync(spaDir)) {
  // Page JS: no-cache (luôn revalidate bằng ETag, tự động bust khi file thay đổi)
  app.use('/spa/js/pages', express.static(path.join(spaDir, 'js', 'pages'), {
    maxAge: 0, etag: true, lastModified: true
  }));
  // Còn lại: cache 7 ngày
  app.use('/spa', express.static(spaDir, { maxAge: '7d', etag: true }));
  log.info(`Thư mục SPA: ${spaDir}`);
}

// ── 404 ──
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    log.warn(`API không tìm thấy: ${req.method} ${req.originalUrl}`);
    return res.status(404).json({ code: -1, msg: 'Không tìm thấy đường dẫn API' });
  }
  log.warn(`Không tìm thấy: ${req.method} ${req.originalUrl}`);
  res.status(404).send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>404</title></head><body style="font-family:sans-serif;text-align:center;padding:60px;"><h1>404</h1><p>Không tìm thấy trang</p><a href="/spa/login.html">Về trang đăng nhập</a></body></html>');
});

// ── Global error handler ──
app.use(errorHandler);

// ── Auto kill port trước khi listen ──
const { execSync, spawn } = require('child_process');

function killPort(port) {
  try {
    const result = execSync(`netstat -ano | findstr ":${port}" | findstr "LISTENING"`, { encoding: 'utf8' });
    const lines = result.trim().split('\n');
    const pids = new Set();
    for (const line of lines) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && pid !== '0' && pid !== String(process.pid)) pids.add(pid);
    }
    for (const pid of pids) {
      log.warn(`Tắt process đang chiếm port ${port} (PID: ${pid})`);
      try { execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8' }); } catch {}
    }
    if (pids.size > 0) log.ok(`Đã giải phóng port ${port}`);
  } catch {
    // Không có process nào chiếm port — bỏ qua
  }
}

killPort(PORT);

// ── Python Captcha Solver (chạy kèm server) ──
const SOLVER_PORT = parseInt(process.env.SOLVER_PORT) || 5000;
let solverProcess = null;

function startSolver() {
  // Tìm solver.py: thử captcha/ kế bên server/, hoặc ../../captcha/
  const candidates = [
    path.join(__dirname, '..', 'captcha', 'solver.py'),
    path.join(__dirname, '..', '..', 'captcha', 'solver.py')
  ];
  let solverPath = null;
  for (const p of candidates) {
    if (fs.existsSync(p)) { solverPath = p; break; }
  }

  if (!solverPath) {
    log.warn('Không tìm thấy captcha/solver.py — bỏ qua auto-login');
    return;
  }

  // Kill port cũ nếu có
  killPort(SOLVER_PORT);

  // Tìm Python (thử python, python3)
  let pythonCmd = 'python';
  try {
    execSync('python --version', { stdio: 'pipe' });
  } catch {
    try {
      execSync('python3 --version', { stdio: 'pipe' });
      pythonCmd = 'python3';
    } catch {
      log.warn('Không tìm thấy Python — captcha solver không khởi động');
      return;
    }
  }

  log.info(`Khởi động Captcha Solver: ${pythonCmd} ${solverPath} ${SOLVER_PORT}`);
  solverProcess = spawn(pythonCmd, [solverPath, String(SOLVER_PORT)], {
    cwd: path.dirname(solverPath),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const solverLog = createLogger('solver');

  solverProcess.stdout.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => { if (line) solverLog.info(line); });
  });

  solverProcess.stderr.on('data', (data) => {
    const lines = data.toString().trim().split('\n');
    lines.forEach(line => {
      // Flask ghi log ra stderr, không phải lỗi thực sự
      if (line && !line.includes('WARNING') && !line.includes('Press CTRL'))
        solverLog.info(line);
    });
  });

  solverProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      solverLog.error(`Solver thoát với code ${code}`);
    }
    solverProcess = null;
  });

  solverProcess.on('error', (err) => {
    solverLog.error(`Solver lỗi: ${err.message}`);
    solverProcess = null;
  });
}

startSolver();

// ── Login Worker Thread ──
const { Worker } = require('worker_threads');
let loginWorker = null;

try {
  const workerPath = path.join(__dirname, 'workers', 'loginWorker.js');
  if (fs.existsSync(workerPath)) {
    loginWorker = new Worker(workerPath);
    loginWorker.on('message', (msg) => {
      if (msg.type === 'login_result') {
        const status = msg.success ? 'thành công' : `thất bại: ${msg.error}`;
        log.info(`[LoginWorker] Agent #${msg.agentId} — ${status} (${msg.source})`);
      }
    });
    loginWorker.on('error', (err) => {
      log.error(`LoginWorker lỗi: ${err.message}`);
    });
    log.ok('Login Worker đã khởi động');
  }
} catch (err) {
  log.warn(`Không thể khởi động Login Worker: ${err.message}`);
}

// ── Graceful shutdown ──
function shutdown() {
  if (loginWorker) loginWorker.postMessage({ type: 'shutdown' });
  if (solverProcess) {
    log.info('Tắt Captcha Solver...');
    solverProcess.kill();
    solverProcess = null;
  }
  closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => { log.info('Nhận SIGTERM — đang tắt...'); shutdown(); });
process.on('SIGINT', () => { log.info('Nhận SIGINT — đang tắt...'); shutdown(); });

// ── Uncaught Exception / Unhandled Rejection ──
process.on('uncaughtException', (err) => {
  log.error('UNCAUGHT EXCEPTION! Đang tắt server...', { error: err.message, stack: err.stack });
  shutdown();
});
process.on('unhandledRejection', (reason) => {
  log.error('UNHANDLED REJECTION — sẽ tắt server sau 3s', { reason: String(reason) });
  setTimeout(() => shutdown(), 3000);
});

// ── Khởi động ──
app.listen(PORT, () => {
  log.ok(`Máy chủ Agent Hub đang chạy tại http://localhost:${PORT}`);
  log.info(`Thư mục log: ${LOG_DIR}`);

  const agentCount = db.prepare('SELECT COUNT(*) as cnt FROM ee88_agents').get().cnt;
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM hub_users').get().cnt;
  log.info('Cấu hình', {
    cổng: PORT,
    agents: agentCount,
    users: userCount,
    jwt: 'enabled'
  });
});
