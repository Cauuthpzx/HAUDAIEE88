const fs = require('fs');
const path = require('path');

// ── Tạo thư mục logs ──
const LOG_DIR = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ── Helpers ──
function getLogDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0');
}

// ── Colors + Icons ──
const C = {
  reset: '\x1b[0m',
  gray:  '\x1b[90m',
  cyan:  '\x1b[36m',
  green: '\x1b[32m',
  yellow:'\x1b[33m',
  red:   '\x1b[31m',
  white: '\x1b[37m',
  dim:   '\x1b[2m',
  bold:  '\x1b[1m',
};

const LEVELS = {
  INFO:  { icon: 'ℹ', color: C.cyan,   label: 'INFO ' },
  OK:    { icon: '✓', color: C.green,  label: ' OK  ' },
  WARN:  { icon: '⚠', color: C.yellow, label: 'WARN ' },
  ERROR: { icon: '✗', color: C.red,    label: 'ERROR' },
  DEBUG: { icon: '·', color: C.gray,   label: 'DEBUG' },
};

// ── Format ──
function formatMeta(meta) {
  if (meta === undefined || meta === null) return '';
  if (typeof meta === 'string') return ' | ' + meta;
  return ' | ' + JSON.stringify(meta);
}

/**
 * Console format (có màu, ngắn gọn):
 *   14:20:00 ✓  OK   fanout     Fetch done — 45 rows
 */
function formatConsole(level, context, message, meta) {
  const L = LEVELS[level] || LEVELS.INFO;
  const time = C.gray + getTime() + C.reset;
  const icon = L.color + L.icon + C.reset;
  const lbl = L.color + L.label + C.reset;
  const ctx = C.white + context.padEnd(10) + C.reset;
  const msg = message + formatMeta(meta);
  return `${time} ${icon} ${lbl} ${ctx} ${msg}`;
}

/**
 * File format (đầy đủ, không màu):
 *   2026-02-18 14:20:00 [INFO] [fanout] Fetch done — 45 rows
 */
function formatFile(level, context, message, meta) {
  const d = new Date();
  const ts = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') +
    ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' + String(d.getSeconds()).padStart(2, '0');
  return `${ts} [${level.padEnd(5)}] [${context}] ${message}${formatMeta(meta)}`;
}

// ── Ghi file ──
function writeToFile(line) {
  const filePath = path.join(LOG_DIR, `${getLogDate()}.log`);
  fs.appendFileSync(filePath, line + '\n');
}

// ── Public API ──
function createLogger(context) {
  function log(level, message, meta) {
    console.log(formatConsole(level, context, message, meta));
    writeToFile(formatFile(level, context, message, meta));
  }

  return {
    info:  (msg, meta) => log('INFO',  msg, meta),
    warn:  (msg, meta) => log('WARN',  msg, meta),
    error: (msg, meta) => log('ERROR', msg, meta),
    debug: (msg, meta) => log('DEBUG', msg, meta),
    ok:    (msg, meta) => log('OK',    msg, meta),
  };
}

// ── Morgan stream ──
const accessLogStream = fs.createWriteStream(
  path.join(LOG_DIR, `access-${getLogDate()}.log`),
  { flags: 'a' }
);

// ── Dọn log cũ ──
function cleanOldLogs(retentionDays) {
  if (!retentionDays || retentionDays <= 0) return;
  const now = Date.now();
  const maxAge = retentionDays * 24 * 60 * 60 * 1000;
  let cleaned = 0;
  try {
    const files = fs.readdirSync(LOG_DIR);
    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      try {
        const stat = fs.statSync(path.join(LOG_DIR, file));
        if (now - stat.mtimeMs > maxAge) {
          fs.unlinkSync(path.join(LOG_DIR, file));
          cleaned++;
        }
      } catch {}
    }
    if (cleaned > 0) {
      console.log(formatConsole('OK', 'logger', `Dọn ${cleaned} log cũ (>${retentionDays} ngày)`));
    }
  } catch {}
}

module.exports = { createLogger, accessLogStream, LOG_DIR, cleanOldLogs };
