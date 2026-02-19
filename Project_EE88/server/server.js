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
const {
  createLogger,
  accessLogStream,
  LOG_DIR,
  cleanOldLogs
} = require('./utils/logger');
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

  // Ghi vào .env để token ổn định qua restart
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';
  try {
    envContent = fs.readFileSync(envPath, 'utf8');
  } catch (e) {
    /* no .env yet */
  }
  if (!envContent.includes('JWT_SECRET=')) {
    fs.appendFileSync(envPath, `\nJWT_SECRET=${newSecret}\n`);
    log.ok('JWT_SECRET đã sinh và ghi vào .env — token ổn định qua restart.');
  }
}

// ── Dọn log cũ ──
cleanOldLogs(config.logging.retentionDays);

// ── Khởi tạo database ──
const db = getDb();
log.ok('Database đã khởi tạo');

// ── Security Middleware ──
app.disable('x-powered-by'); // Ẩn fingerprint Express
app.set('trust proxy', 1); // IP chính xác qua reverse proxy
app.use(
  helmet({
    contentSecurityPolicy: false, // Tắt CSP — Layui dùng inline scripts/styles
    crossOriginEmbedderPolicy: false
  })
);

app.use(cors());

// ── Rate Limiting ──
app.use(
  '/api/',
  rateLimit({
    windowMs: config.security.rateLimit.windowMs,
    max: config.security.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: -1, msg: 'Quá nhiều yêu cầu, vui lòng thử lại sau' }
  })
);

app.use(
  '/api/auth/login',
  rateLimit({
    windowMs: config.security.authRateLimit.windowMs,
    max: config.security.authRateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      code: -1,
      msg: 'Quá nhiều lần thử đăng nhập, vui lòng đợi 15 phút'
    }
  })
);

// Strict rate limit cho admin sensitive operations
app.use(
  '/api/admin/agents/login',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { code: -1, msg: 'Quá nhiều yêu cầu login agent, đợi 15 phút' }
  })
);

// Morgan: file log (skip health), dev console chỉ khi NODE_ENV !== production
const skipHealth = (req) => req.path === '/api/health';
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev', { skip: skipHealth }));
}
app.use(
  morgan(
    '[:date[iso]] :method :url :status :res[content-length] - :response-time ms ":user-agent"',
    {
      stream: accessLogStream,
      skip: skipHealth
    }
  )
);

app.use(express.json({ limit: config.security.bodyLimit }));

// ── Nén response (gzip) — PHẢI đặt trước routes + static ──
app.use(compression({ threshold: 1024 }));

// ── Routes ──
// Auth: không cần JWT
app.use('/api/auth', authRoutes);

// Data + Action: cần JWT + permission
app.use('/api/data', proxyRoutes);
app.use('/api/action', actionRoutes);

// Dashboard: cần JWT + permission (hiển thị cho tất cả users)
app.use('/api/dashboard', dashboardRoutes);

// Sync: mount TRƯỚC admin vì SSE endpoint cần pre-middleware cho query token
app.use('/api/admin', syncRoutes);

// Admin: cần JWT + admin role
app.use('/api/admin', adminRoutes);

app.get('/api/health', (req, res) => {
  const stats = db
    .prepare(
      'SELECT (SELECT COUNT(*) FROM ee88_agents WHERE status = 1) as agents, (SELECT COUNT(*) FROM hub_users WHERE status = 1) as users'
    )
    .get();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    agents: stats.agents,
    users: stats.users
  });
});

// ── LiveReload (dev only) ──
const clientDir = path.join(__dirname, '..', 'client');
const isProd = process.env.NODE_ENV === 'production';
if (!isProd) {
  const livereload = require('livereload');
  const connectLR = require('connect-livereload');
  const lrServer = livereload.createServer({
    exts: ['html', 'css', 'js'],
    delay: 200
  });
  lrServer.watch(clientDir);
  app.use(connectLR());
  log.ok('LiveReload đã bật (dev mode)');
}

// ── Phục vụ file tĩnh từ client/ ──
// Lib files: cache 1 năm + immutable (không bao giờ revalidate)
app.use(
  '/lib',
  express.static(path.join(clientDir, 'lib'), {
    maxAge: '365d',
    immutable: true,
    etag: false,
    lastModified: false
  })
);
// Dev: no-cache (luôn revalidate bằng ETag) — Prod: cache 7 ngày
app.use(express.static(clientDir, { maxAge: isProd ? '7d' : 0, etag: true }));
log.info(`Thư mục client: ${clientDir}`);

// ── 404 ──
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    log.warn(`API không tìm thấy: ${req.method} ${req.originalUrl}`);
    return res
      .status(404)
      .json({ code: -1, msg: 'Không tìm thấy đường dẫn API' });
  }
  log.warn(`Không tìm thấy: ${req.method} ${req.originalUrl}`);
  res
    .status(404)
    .send(
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>404</title></head><body style="font-family:sans-serif;text-align:center;padding:60px;"><h1>404</h1><p>Không tìm thấy trang</p><a href="/pages/login.html">Về trang đăng nhập</a></body></html>'
    );
});

// ── Global error handler ──
app.use(errorHandler);

// ── Auto kill port trước khi listen ──
const { execSync } = require('child_process');

function killPort(port) {
  try {
    const result = execSync(
      `netstat -ano | findstr ":${port}" | findstr "LISTENING"`,
      { encoding: 'utf8' }
    );
    const lines = result.trim().split('\n');
    const pids = new Set();
    for (const line of lines) {
      const pid = line.trim().split(/\s+/).pop();
      if (pid && pid !== '0' && pid !== String(process.pid)) pids.add(pid);
    }
    for (const pid of pids) {
      log.warn(`Tắt process đang chiếm port ${port} (PID: ${pid})`);
      try {
        execSync(`taskkill /PID ${pid} /F`, { encoding: 'utf8' });
      } catch {}
    }
    if (pids.size > 0) log.ok(`Đã giải phóng port ${port}`);
  } catch {
    // Không có process nào chiếm port — bỏ qua
  }
}

killPort(PORT);

// ── JS Captcha Solver (Tesseract.js OCR — warm up lúc start) ──
const { initSolver } = require('./services/loginService');
const { terminateOCR } = require('./services/captchaSolver');
initSolver();

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
        log.info(
          `[LoginWorker] Agent #${msg.agentId} — ${status} (${msg.source})`
        );
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
  terminateOCR().catch(() => {});
  closeDb();
  process.exit(0);
}

process.on('SIGTERM', () => {
  log.info('Nhận SIGTERM — đang tắt...');
  shutdown();
});
process.on('SIGINT', () => {
  log.info('Nhận SIGINT — đang tắt...');
  shutdown();
});

// ── Uncaught Exception / Unhandled Rejection ──
process.on('uncaughtException', (err) => {
  log.error('UNCAUGHT EXCEPTION! Đang tắt server...', {
    error: err.message,
    stack: err.stack
  });
  shutdown();
});
process.on('unhandledRejection', (reason) => {
  log.error('UNHANDLED REJECTION — sẽ tắt server sau 3s', {
    reason: String(reason)
  });
  setTimeout(() => shutdown(), 3000);
});

// ── Khởi động ──
app.listen(PORT, () => {
  log.ok(`Máy chủ Agent Hub đang chạy tại http://localhost:${PORT}`);
  log.info(`Thư mục log: ${LOG_DIR}`);

  const agentCount = db
    .prepare('SELECT COUNT(*) as cnt FROM ee88_agents')
    .get().cnt;
  const userCount = db
    .prepare('SELECT COUNT(*) as cnt FROM hub_users')
    .get().cnt;
  log.info('Cấu hình', {
    cổng: PORT,
    agents: agentCount,
    users: userCount,
    jwt: 'enabled'
  });
});
