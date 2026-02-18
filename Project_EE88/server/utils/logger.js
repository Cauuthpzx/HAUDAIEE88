const fs = require('fs');
const path = require('path');

// ── Tạo thư mục logs ──
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ── Helpers ──
function getTimestamp() {
  return new Date().toISOString();
}

function getLogDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatMsg(level, context, message, meta) {
  const ts = getTimestamp();
  const metaStr = meta !== undefined ? ` | ${typeof meta === 'string' ? meta : JSON.stringify(meta)}` : '';
  return `[${ts}] [${level}] [${context}]  ${message}${metaStr}`;
}

// ── Ghi file (append, 1 file/ngày) ──
function writeToFile(line) {
  const filePath = path.join(LOG_DIR, `${getLogDate()}.log`);
  fs.appendFileSync(filePath, line + '\n');
}

// ── COLORS cho console ──
const COLORS = {
  INFO:  '\x1b[36m',  // cyan
  WARN:  '\x1b[33m',  // yellow
  ERROR: '\x1b[31m',  // red
  DEBUG: '\x1b[90m',  // gray
  OK:    '\x1b[32m',  // green
  RESET: '\x1b[0m'
};

function colorize(level, line) {
  const c = COLORS[level] || COLORS.RESET;
  return `${c}${line}${COLORS.RESET}`;
}

// ── Public API ──
function createLogger(context) {
  function log(level, message, meta) {
    const line = formatMsg(level, context, message, meta);
    // Console (có màu)
    console.log(colorize(level, line));
    // File (không màu)
    writeToFile(line);
  }

  return {
    info:  (msg, meta) => log('INFO',  msg, meta),
    warn:  (msg, meta) => log('WARN',  msg, meta),
    error: (msg, meta) => log('ERROR', msg, meta),
    debug: (msg, meta) => log('DEBUG', msg, meta),
    ok:    (msg, meta) => log('OK',    msg, meta),
  };
}

// ── Morgan stream (ghi access log ra file riêng) ──
const accessLogStream = fs.createWriteStream(
  path.join(LOG_DIR, `access-${getLogDate()}.log`),
  { flags: 'a' }
);

// ── Dọn log cũ (log rotation) ──
function cleanOldLogs(retentionDays) {
  if (!retentionDays || retentionDays <= 0) return;

  const now = Date.now();
  const maxAge = retentionDays * 24 * 60 * 60 * 1000;
  let cleaned = 0;

  try {
    const files = fs.readdirSync(LOG_DIR);
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      const filePath = path.join(LOG_DIR, file);
      try {
        const stat = fs.statSync(filePath);
        if (now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch {}
    }
    if (cleaned > 0) {
      const line = formatMsg('OK', 'logger', `Đã dọn ${cleaned} file log cũ hơn ${retentionDays} ngày`);
      console.log(colorize('OK', line));
    }
  } catch {}
}

module.exports = { createLogger, accessLogStream, LOG_DIR, cleanOldLogs };
