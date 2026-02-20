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
    if (
      fs.existsSync(path.join(dir, 'package.json')) &&
      fs.existsSync(path.join(dir, 'captcha'))
    ) {
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
  db.pragma('cache_size = -32000'); // 32MB cache (default 2MB)
  db.pragma('temp_store = MEMORY'); // Sort/temp in RAM
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
  const cols = db
    .prepare('PRAGMA table_info(ee88_agents)')
    .all()
    .map((c) => c.name);
  if (!cols.includes('ee88_username')) {
    db.exec("ALTER TABLE ee88_agents ADD COLUMN ee88_username TEXT DEFAULT ''");
    log.info('Migrate: thêm cột ee88_username');
  }
  if (!cols.includes('ee88_password')) {
    db.exec("ALTER TABLE ee88_agents ADD COLUMN ee88_password TEXT DEFAULT ''");
    log.info('Migrate: thêm cột ee88_password');
  }
  if (!cols.includes('last_login')) {
    db.exec('ALTER TABLE ee88_agents ADD COLUMN last_login TEXT');
    log.info('Migrate: thêm cột last_login');
  }
  if (!cols.includes('user_agent')) {
    db.exec("ALTER TABLE ee88_agents ADD COLUMN user_agent TEXT DEFAULT ''");
    log.info('Migrate: thêm cột user_agent');
  }
  if (!cols.includes('is_deleted')) {
    db.exec(
      'ALTER TABLE ee88_agents ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0'
    );
    log.info('Migrate: thêm cột is_deleted');
  }

  // Migrate: token_version + must_change_password cho hub_users
  const userCols = db
    .prepare('PRAGMA table_info(hub_users)')
    .all()
    .map((c) => c.name);
  if (!userCols.includes('token_version')) {
    db.exec(
      'ALTER TABLE hub_users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0'
    );
    log.info('Migrate: thêm cột token_version');
  }
  if (!userCols.includes('must_change_password')) {
    db.exec(
      'ALTER TABLE hub_users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0'
    );
    // Đánh dấu admin mặc định phải đổi mật khẩu (nếu vẫn dùng password mặc định)
    const admin = db
      .prepare(
        "SELECT id, password_hash FROM hub_users WHERE username = 'admin'"
      )
      .get();
    if (admin && bcrypt.compareSync('admin123', admin.password_hash)) {
      db.prepare(
        'UPDATE hub_users SET must_change_password = 1 WHERE id = ?'
      ).run(admin.id);
    }
    log.info('Migrate: thêm cột must_change_password');
  }

  // Migrate: thêm cột mới cho data_members (sort/filter fields)
  const memberCols = db
    .prepare('PRAGMA table_info(data_members)')
    .all()
    .map((c) => c.name);
  if (memberCols.length > 0 && !memberCols.includes('first_deposit_time')) {
    db.exec('ALTER TABLE data_members ADD COLUMN first_deposit_time TEXT');
    log.info('Migrate: thêm cột first_deposit_time cho data_members');
  }
  if (memberCols.length > 0 && !memberCols.includes('deposit_money')) {
    db.exec('ALTER TABLE data_members ADD COLUMN deposit_money REAL DEFAULT 0');
    log.info('Migrate: thêm cột deposit_money cho data_members');
  }
  if (memberCols.length > 0 && !memberCols.includes('withdrawal_money')) {
    db.exec(
      'ALTER TABLE data_members ADD COLUMN withdrawal_money REAL DEFAULT 0'
    );
    log.info('Migrate: thêm cột withdrawal_money cho data_members');
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
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_activity_created ON hub_activity_log(created_at DESC)'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_activity_action ON hub_activity_log(action)'
  );

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
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_login_hist_agent ON agent_login_history(agent_id, created_at DESC)'
  );
  db.exec(
    'CREATE INDEX IF NOT EXISTS idx_login_hist_created ON agent_login_history(created_at)'
  );

  // ── Migrate: tối ưu indexes — xoá index thừa, thêm compound indexes ──
  // Drop redundant single-column indexes (đã được cover bởi UNIQUE + compound)
  db.exec('DROP INDEX IF EXISTS idx_sync_day_locks_agent');   // → UNIQUE(agent_id, date_key)
  db.exec('DROP INDEX IF EXISTS idx_data_members_agent');     // → UNIQUE(agent_id, uid)
  db.exec('DROP INDEX IF EXISTS idx_data_members_register');  // → compound (agent_id, register_time)
  db.exec('DROP INDEX IF EXISTS idx_data_invites_agent');     // → UNIQUE(agent_id, ee88_id)
  db.exec('DROP INDEX IF EXISTS idx_data_deposits_agent');    // → UNIQUE(agent_id, serial_no) + compound
  db.exec('DROP INDEX IF EXISTS idx_data_deposits_time');     // → compound (agent_id, create_time DESC)
  db.exec('DROP INDEX IF EXISTS idx_data_withdrawals_agent'); // → UNIQUE(agent_id, serial_no) + compound
  db.exec('DROP INDEX IF EXISTS idx_data_withdrawals_time');  // → compound (agent_id, create_time DESC)
  db.exec('DROP INDEX IF EXISTS idx_data_bet_orders_agent');  // → UNIQUE(agent_id, serial_no) + compound
  db.exec('DROP INDEX IF EXISTS idx_data_bet_orders_time');   // → compound (agent_id, bet_time DESC)
  db.exec('DROP INDEX IF EXISTS idx_data_lottery_bets_agent');// → UNIQUE(agent_id, serial_no) + compound
  db.exec('DROP INDEX IF EXISTS idx_data_lottery_bets_time'); // → compound (agent_id, create_time DESC)

  // New optimized indexes
  db.exec('CREATE INDEX IF NOT EXISTS idx_agents_deleted_status ON ee88_agents(is_deleted, status)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_agents_ee88_username ON ee88_agents(ee88_username)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_permissions_agent ON user_agent_permissions(agent_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_members_agent_register ON data_members(agent_id, register_time)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_members_agent_login ON data_members(agent_id, last_login_time)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_invites_agent_create ON data_invites(agent_id, create_time)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_deposits_agent_uid ON data_deposits(agent_id, uid)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_bet_orders_username ON data_bet_orders(username)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_lottery_bets_username ON data_lottery_bets(username)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_activity_username ON hub_activity_log(username)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_login_hist_created_agent ON agent_login_history(created_at, agent_id)');

  // ANALYZE — cập nhật thống kê cho query planner sau khi thay đổi indexes
  db.exec('ANALYZE');
  log.ok('Indexes đã tối ưu + ANALYZE hoàn tất');

  // Seed admin nếu chưa có user nào
  const userCount = db
    .prepare('SELECT COUNT(*) as cnt FROM hub_users')
    .get().cnt;
  if (userCount === 0) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(
      'INSERT INTO hub_users (username, password_hash, display_name, role, must_change_password) VALUES (?, ?, ?, ?, 1)'
    ).run('admin', hash, 'Administrator', 'admin');
    log.ok(
      'Đã tạo tài khoản admin mặc định (admin / admin123) — yêu cầu đổi mật khẩu lần đầu'
    );
  }

  // Migrate agent từ .env nếu chưa có agent nào
  const agentCount = db
    .prepare('SELECT COUNT(*) as cnt FROM ee88_agents')
    .get().cnt;
  if (
    agentCount === 0 &&
    process.env.EE88_BASE_URL &&
    process.env.EE88_COOKIE
  ) {
    const result = db
      .prepare(
        'INSERT INTO ee88_agents (label, base_url, cookie) VALUES (?, ?, ?)'
      )
      .run('Agent chính', process.env.EE88_BASE_URL, process.env.EE88_COOKIE);
    log.ok(`Đã migrate agent từ .env (id=${result.lastInsertRowid})`);

    // Gán agent cho admin
    const admin = db
      .prepare('SELECT id FROM hub_users WHERE username = ?')
      .get('admin');
    if (admin) {
      db.prepare(
        'INSERT INTO user_agent_permissions (user_id, agent_id) VALUES (?, ?)'
      ).run(admin.id, result.lastInsertRowid);
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
