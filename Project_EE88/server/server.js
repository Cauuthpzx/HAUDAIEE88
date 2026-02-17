require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { createLogger, accessLogStream, LOG_DIR } = require('./utils/logger');
const proxyRoutes = require('./routes/proxy');

const log = createLogger('server');
const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ──
app.use(cors());

// Morgan: console dùng format 'dev', file dùng format 'combined'
app.use(morgan('dev'));
app.use(morgan('[:date[iso]] :method :url :status :res[content-length] - :response-time ms ":user-agent"', {
  stream: accessLogStream
}));

app.use(express.json());

// ── Ghi log mọi request đến ──
app.use((req, res, next) => {
  log.info(`Yêu cầu đến → ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    query: Object.keys(req.query).length ? req.query : undefined
  });
  next();
});

// ── Routes ──
app.use('/api/data', proxyRoutes);

app.get('/api/health', (req, res) => {
  log.ok('Kiểm tra sức khoẻ: OK');
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Phục vụ file tĩnh từ client/ ──
const clientDir = path.join(__dirname, '..', 'client');
app.use(express.static(clientDir));
log.info(`Thư mục client: ${clientDir}`);

// ── 404 ──
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    log.warn(`API không tìm thấy: ${req.method} ${req.originalUrl}`);
    return res.status(404).json({ code: -1, msg: 'Không tìm thấy đường dẫn API' });
  }
  log.warn(`Không tìm thấy: ${req.method} ${req.originalUrl}`);
  res.status(404).sendFile(path.join(clientDir, 'index.html'));
});

// ── Xử lý lỗi toàn cục ──
app.use((err, req, res, _next) => {
  log.error(`Lỗi không xử lý được: ${err.message}`, { stack: err.stack });
  res.status(500).json({ code: -1, msg: 'Lỗi máy chủ nội bộ' });
});

// ── Auto kill port trước khi listen ──
const { execSync } = require('child_process');

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

// ── Khởi động ──
app.listen(PORT, () => {
  log.ok(`Máy chủ Agent Hub đang chạy tại http://localhost:${PORT}`);
  log.info(`Thư mục log: ${LOG_DIR}`);
  log.info(`Kiểm thử: curl http://localhost:${PORT}/api/data/members`);
  const cookie = process.env.EE88_COOKIE || '';
  const sessId = cookie.match(/PHPSESSID=([^;]+)/)?.[1];
  log.info('Cấu hình', {
    cổng: PORT,
    ee88_url: process.env.EE88_BASE_URL,
    phiên: sessId ? `${sessId.substring(0, 8)}...` : 'CHƯA CÀI ĐẶT'
  });
});
