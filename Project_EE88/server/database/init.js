const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { createLogger } = require('../utils/logger');

const log = createLogger('database');

// Tìm project root: đi lên từ __dirname, tìm thư mục có cả package.json + captcha/
// (captcha/ chỉ tồn tại ở project root, không có ở dist/server/)
function findProjectRoot(startDir) {
  let dir = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(dir, 'package.json')) && fs.existsSync(path.join(dir, 'captcha'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd(); // fallback
}

// DB duy nhất tại PROJECT_ROOT/data/ — không phụ thuộc process.cwd()
const PROJECT_ROOT = findProjectRoot(__dirname);
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'agent-hub.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

function getDb() {
  if (db) return db;

  const isNew = !fs.existsSync(DB_PATH);
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('cache_size = -32000');   // 32MB cache (default 2MB)
  db.pragma('temp_store = MEMORY');   // Sort/temp in RAM
  db.pragma('mmap_size = 30000000'); // 30MB memory-mapped I/O
  db.pragma('synchronous = NORMAL'); // Faster writes, WAL ensures safety

  if (isNew) {
    log.info('Tạo database mới...');
  }

  // Chạy schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);
  log.ok('Schema đã sẵn sàng');

  // Migrate: thêm cột mới cho ee88_agents (Phase 5: auto-login)
  const cols = db.prepare("PRAGMA table_info(ee88_agents)").all().map(c => c.name);
  if (!cols.includes('ee88_username')) {
    db.exec("ALTER TABLE ee88_agents ADD COLUMN ee88_username TEXT DEFAULT ''");
    log.info('Migrate: thêm cột ee88_username');
  }
  if (!cols.includes('ee88_password')) {
    db.exec("ALTER TABLE ee88_agents ADD COLUMN ee88_password TEXT DEFAULT ''");
    log.info('Migrate: thêm cột ee88_password');
  }
  if (!cols.includes('last_login')) {
    db.exec("ALTER TABLE ee88_agents ADD COLUMN last_login TEXT");
    log.info('Migrate: thêm cột last_login');
  }
  if (!cols.includes('user_agent')) {
    db.exec("ALTER TABLE ee88_agents ADD COLUMN user_agent TEXT DEFAULT ''");
    log.info('Migrate: thêm cột user_agent');
  }

  // Migrate: token_version cho hub_users (logout all devices)
  const userCols = db.prepare("PRAGMA table_info(hub_users)").all().map(c => c.name);
  if (!userCols.includes('token_version')) {
    db.exec("ALTER TABLE hub_users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0");
    log.info('Migrate: thêm cột token_version');
  }

  // Migrate: bảng nhật ký hoạt động
  db.exec(`
    CREATE TABLE IF NOT EXISTS hub_activity_log (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER,
      username     TEXT NOT NULL,
      action       TEXT NOT NULL,
      target_type  TEXT,
      target_id    INTEGER,
      target_label TEXT,
      detail       TEXT,
      ip           TEXT,
      created_at   TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_activity_created ON hub_activity_log(created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_activity_action ON hub_activity_log(action)');

  // Migrate: bảng lịch sử login EE88
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_login_history (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id     INTEGER NOT NULL,
      agent_label  TEXT,
      success      INTEGER NOT NULL DEFAULT 0,
      attempts     INTEGER DEFAULT 0,
      error_msg    TEXT,
      source       TEXT NOT NULL DEFAULT 'manual',
      triggered_by TEXT,
      duration_ms  INTEGER,
      created_at   TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
    )
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_login_hist_agent ON agent_login_history(agent_id, created_at DESC)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_login_hist_created ON agent_login_history(created_at)');
  // Migrate: bảng sync_day_locks (đã trong schema, đảm bảo index)
  db.exec('CREATE INDEX IF NOT EXISTS idx_sync_day_locks_agent ON sync_day_locks(agent_id)');

  // Migrate: mã hóa ee88_password (Security: encrypt at rest)
  const { encrypt, isEncrypted, ensureEncryptionKey } = require('../utils/crypto');
  ensureEncryptionKey();
  const agentsToEncrypt = db.prepare("SELECT id, ee88_password FROM ee88_agents WHERE ee88_password != ''").all();
  let encryptedCount = 0;
  for (const a of agentsToEncrypt) {
    if (!isEncrypted(a.ee88_password)) {
      db.prepare('UPDATE ee88_agents SET ee88_password = ? WHERE id = ?')
        .run(encrypt(a.ee88_password), a.id);
      encryptedCount++;
    }
  }
  if (encryptedCount > 0) {
    log.ok(`Migrate: mã hóa ${encryptedCount} ee88_password`);
  }

  // Seed admin nếu chưa có user nào
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM hub_users').get().cnt;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(
      'INSERT INTO hub_users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
    ).run('admin', hash, 'Administrator', 'admin');
    log.ok('Đã tạo tài khoản admin mặc định (admin / admin123)');
  }

  // Migrate agent từ .env nếu chưa có agent nào
  const agentCount = db.prepare('SELECT COUNT(*) as cnt FROM ee88_agents').get().cnt;
  if (agentCount === 0 && process.env.EE88_BASE_URL && process.env.EE88_COOKIE) {
    const result = db.prepare(
      'INSERT INTO ee88_agents (label, base_url, cookie) VALUES (?, ?, ?)'
    ).run('Agent chính', process.env.EE88_BASE_URL, process.env.EE88_COOKIE);
    log.ok(`Đã migrate agent từ .env (id=${result.lastInsertRowid})`);

    // Gán agent cho admin
    const admin = db.prepare('SELECT id FROM hub_users WHERE username = ?').get('admin');
    if (admin) {
      db.prepare('INSERT INTO user_agent_permissions (user_id, agent_id) VALUES (?, ?)').run(admin.id, result.lastInsertRowid);
      log.ok('Đã gán agent cho admin');
    }
  }

  return db;
}

function closeDb() {
  if (db) {
    db.close();
    db = null;
    log.info('Database đã đóng');
  }
}

module.exports = { getDb, closeDb };
