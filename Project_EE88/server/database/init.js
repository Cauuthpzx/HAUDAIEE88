const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const { createLogger } = require('../utils/logger');

const log = createLogger('database');

const DB_PATH = path.join(__dirname, 'agent-hub.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

function getDb() {
  if (db) return db;

  const isNew = !fs.existsSync(DB_PATH);
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

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
