-- Hub Users: tài khoản đăng nhập Agent Hub
CREATE TABLE IF NOT EXISTS hub_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
  token_version INTEGER NOT NULL DEFAULT 0,
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- EE88 Agents: tài khoản ee88 (N agents)
CREATE TABLE IF NOT EXISTS ee88_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  cookie TEXT DEFAULT '',
  user_agent TEXT DEFAULT '',
  ee88_username TEXT DEFAULT '',
  ee88_password TEXT DEFAULT '',
  status INTEGER NOT NULL DEFAULT 1,
  last_check TEXT,
  last_login TEXT,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- Phân quyền: user nào được xem agent nào
CREATE TABLE IF NOT EXISTS user_agent_permissions (
  user_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  PRIMARY KEY (user_id, agent_id),
  FOREIGN KEY (user_id) REFERENCES hub_users(id) ON DELETE CASCADE,
  FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
);

-- Sync day locks — khoá ngày đã đồng bộ hoàn tất (hash để verify)
CREATE TABLE IF NOT EXISTS sync_day_locks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  date_key TEXT NOT NULL,
  data_hash TEXT NOT NULL,
  row_counts TEXT,
  locked_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(agent_id, date_key),
  FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sync_day_locks_agent ON sync_day_locks(agent_id);

-- ═══════════════════════════════════════════════════════════
-- Phase 7: Data Storage — lưu data thực sự vào SQLite
-- ═══════════════════════════════════════════════════════════

-- 1. Hội viên (members) — snapshot, không có date range
CREATE TABLE IF NOT EXISTS data_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  uid INTEGER,
  username TEXT,
  user_parent TEXT,
  user_parent_format TEXT,
  user_tree TEXT,
  group_id INTEGER,
  balance REAL DEFAULT 0,
  status INTEGER DEFAULT 1,
  is_tester INTEGER DEFAULT 0,
  register_time TEXT,
  last_login_time TEXT,
  extra TEXT,
  synced_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(agent_id, uid),
  FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_data_members_agent ON data_members(agent_id);
CREATE INDEX IF NOT EXISTS idx_data_members_username ON data_members(username);

-- 2. Mã mời (invites) — snapshot
CREATE TABLE IF NOT EXISTS data_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  ee88_id INTEGER,
  uid INTEGER,
  invite_code TEXT,
  user_type INTEGER,
  group_id INTEGER,
  reg_count INTEGER DEFAULT 0,
  scope_reg_count INTEGER DEFAULT 0,
  recharge_count INTEGER DEFAULT 0,
  first_recharge_count INTEGER DEFAULT 0,
  register_recharge_count INTEGER DEFAULT 0,
  remark TEXT,
  rebate_arr TEXT,
  create_time TEXT,
  update_time TEXT,
  extra TEXT,
  synced_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(agent_id, ee88_id),
  FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_data_invites_agent ON data_invites(agent_id);

-- 3. Nạp tiền (deposits) — theo ngày, unique serial_no
CREATE TABLE IF NOT EXISTS data_deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  serial_no TEXT,
  uid INTEGER,
  username TEXT,
  user_parent TEXT,
  user_parent_format TEXT,
  user_tree TEXT,
  group_id INTEGER,
  type INTEGER,
  amount REAL DEFAULT 0,
  true_amount REAL DEFAULT 0,
  status INTEGER,
  operator TEXT,
  name TEXT,
  bank_id TEXT,
  account TEXT,
  branch TEXT,
  category_id INTEGER,
  merchant_id INTEGER,
  pay_type INTEGER,
  trade_id TEXT,
  firm_fee REAL DEFAULT 0,
  user_fee REAL DEFAULT 0,
  rebate REAL DEFAULT 0,
  prize_amount REAL DEFAULT 0,
  activity_id INTEGER,
  currency TEXT,
  remark TEXT,
  user_remark TEXT,
  is_tester INTEGER DEFAULT 0,
  create_time TEXT,
  success_time TEXT,
  review_time TEXT,
  transfer_time TEXT,
  extra TEXT,
  synced_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(agent_id, serial_no),
  FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_data_deposits_agent ON data_deposits(agent_id);
CREATE INDEX IF NOT EXISTS idx_data_deposits_time ON data_deposits(create_time);
CREATE INDEX IF NOT EXISTS idx_data_deposits_username ON data_deposits(username);

-- 4. Rút tiền (withdrawals) — theo ngày, unique serial_no
CREATE TABLE IF NOT EXISTS data_withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  serial_no TEXT,
  uid INTEGER,
  username TEXT,
  user_parent TEXT,
  user_parent_format TEXT,
  user_tree TEXT,
  group_id INTEGER,
  amount REAL DEFAULT 0,
  true_amount REAL DEFAULT 0,
  name TEXT,
  bank_id TEXT,
  account TEXT,
  branch TEXT,
  status INTEGER,
  status_format TEXT,
  operator TEXT,
  firm_fee REAL DEFAULT 0,
  user_fee REAL DEFAULT 0,
  rebate REAL DEFAULT 0,
  category_id INTEGER,
  merchant_id INTEGER,
  pay_type INTEGER,
  trade_id TEXT,
  currency TEXT,
  remark TEXT,
  user_remark TEXT,
  is_tester INTEGER DEFAULT 0,
  create_time TEXT,
  success_time TEXT,
  review_time TEXT,
  transfer_time TEXT,
  extra TEXT,
  synced_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(agent_id, serial_no),
  FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_data_withdrawals_agent ON data_withdrawals(agent_id);
CREATE INDEX IF NOT EXISTS idx_data_withdrawals_time ON data_withdrawals(create_time);
CREATE INDEX IF NOT EXISTS idx_data_withdrawals_username ON data_withdrawals(username);

-- 5. Đơn cược bên thứ 3 (bet-orders) — theo ngày, unique serial_no
CREATE TABLE IF NOT EXISTS data_bet_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  serial_no TEXT,
  uid INTEGER,
  username TEXT,
  platform_id INTEGER,
  platform_id_name TEXT,
  cid INTEGER,
  c_name TEXT,
  game_name TEXT,
  bet_amount REAL DEFAULT 0,
  turnover REAL DEFAULT 0,
  prize REAL DEFAULT 0,
  win_lose REAL DEFAULT 0,
  bet_time TEXT,
  platform_username TEXT,
  extra TEXT,
  synced_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(agent_id, serial_no),
  FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_data_bet_orders_agent ON data_bet_orders(agent_id);
CREATE INDEX IF NOT EXISTS idx_data_bet_orders_time ON data_bet_orders(bet_time);

-- 6. Báo cáo xổ số (report-lottery) — aggregated per user/lottery/date
CREATE TABLE IF NOT EXISTS data_report_lottery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  date_key TEXT NOT NULL,
  uid INTEGER,
  username TEXT,
  user_parent_format TEXT,
  lottery_id INTEGER,
  lottery_name TEXT,
  bet_count INTEGER DEFAULT 0,
  bet_amount REAL DEFAULT 0,
  valid_amount REAL DEFAULT 0,
  rebate_amount REAL DEFAULT 0,
  prize REAL DEFAULT 0,
  result REAL DEFAULT 0,
  win_lose REAL DEFAULT 0,
  extra TEXT,
  synced_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(agent_id, date_key, uid, lottery_id),
  FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_data_report_lottery_agent ON data_report_lottery(agent_id, date_key);

-- 7. Sao kê giao dịch (report-funds) — aggregated per user/date
CREATE TABLE IF NOT EXISTS data_report_funds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  date_key TEXT NOT NULL,
  uid INTEGER,
  username TEXT,
  user_parent TEXT,
  user_parent_format TEXT,
  date TEXT,
  deposit_count INTEGER DEFAULT 0,
  deposit_amount REAL DEFAULT 0,
  withdrawal_count INTEGER DEFAULT 0,
  withdrawal_amount REAL DEFAULT 0,
  charge_fee REAL DEFAULT 0,
  agent_commission REAL DEFAULT 0,
  promotion REAL DEFAULT 0,
  third_rebate REAL DEFAULT 0,
  third_activity_amount REAL DEFAULT 0,
  extra TEXT,
  synced_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(agent_id, date_key, uid),
  FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_data_report_funds_agent ON data_report_funds(agent_id, date_key);

-- 8. Báo cáo nhà cung cấp game (report-third) — aggregated per user/platform/date
CREATE TABLE IF NOT EXISTS data_report_third (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  date_key TEXT NOT NULL,
  uid INTEGER,
  username TEXT,
  platform_id INTEGER,
  platform_id_name TEXT,
  t_bet_amount REAL DEFAULT 0,
  t_bet_times INTEGER DEFAULT 0,
  t_turnover REAL DEFAULT 0,
  t_prize REAL DEFAULT 0,
  t_win_lose REAL DEFAULT 0,
  extra TEXT,
  synced_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(agent_id, date_key, uid, platform_id),
  FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_data_report_third_agent ON data_report_third(agent_id, date_key);

-- 9. Đơn cược xổ số (lottery-bets) — theo ngày, unique serial_no
CREATE TABLE IF NOT EXISTS data_lottery_bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  serial_no TEXT,
  uid INTEGER,
  username TEXT,
  lottery_name TEXT,
  play_type_name TEXT,
  play_name TEXT,
  issue TEXT,
  content TEXT,
  money REAL DEFAULT 0,
  rebate_amount REAL DEFAULT 0,
  result REAL DEFAULT 0,
  status_text TEXT,
  create_time TEXT,
  extra TEXT,
  synced_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(agent_id, serial_no),
  FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_data_lottery_bets_agent ON data_lottery_bets(agent_id);
CREATE INDEX IF NOT EXISTS idx_data_lottery_bets_time ON data_lottery_bets(create_time);

-- 10. Tổng hợp (totals) — lưu total_data per agent/endpoint/date
CREATE TABLE IF NOT EXISTS data_totals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id INTEGER NOT NULL,
  endpoint_key TEXT NOT NULL,
  date_key TEXT NOT NULL,
  total_json TEXT NOT NULL,
  synced_at TEXT DEFAULT (datetime('now', 'localtime')),
  UNIQUE(agent_id, endpoint_key, date_key),
  FOREIGN KEY (agent_id) REFERENCES ee88_agents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_data_totals_lookup ON data_totals(agent_id, endpoint_key, date_key);

-- Compound indexes cho tối ưu truy vấn theo agent + thời gian
CREATE INDEX IF NOT EXISTS idx_deposits_agent_time ON data_deposits(agent_id, create_time DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawals_agent_time ON data_withdrawals(agent_id, create_time DESC);
CREATE INDEX IF NOT EXISTS idx_bet_orders_agent_time ON data_bet_orders(agent_id, bet_time DESC);
CREATE INDEX IF NOT EXISTS idx_lottery_bets_agent_time ON data_lottery_bets(agent_id, create_time DESC);
