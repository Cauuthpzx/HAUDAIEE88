# Data Schema — Cấu trúc dữ liệu cho Cache

> Schema SQLite cho việc cache data ee88 về local database
> Mỗi bảng thêm `agent_id` để phân biệt data từ agent nào

---

## Bảng hệ thống

```sql
-- Tài khoản đăng nhập Hub
CREATE TABLE hub_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT DEFAULT 'agent',     -- 'admin' hoặc 'agent'
  is_active     INTEGER DEFAULT 1,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tài khoản ee88 agent
CREATE TABLE ee88_agents (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_name         TEXT NOT NULL,
  ee88_username      TEXT UNIQUE NOT NULL,
  ee88_password      TEXT,
  session_cookie     TEXT,                -- PHPSESSID
  session_expires_at DATETIME,
  base_url           TEXT DEFAULT 'https://a2u4k.ee88dly.com',
  is_active          INTEGER DEFAULT 1,
  created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Phân quyền user ↔ agent (admin role thấy tất cả)
CREATE TABLE agent_permissions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  hub_user_id   INTEGER REFERENCES hub_users(id) ON DELETE CASCADE,
  ee88_agent_id INTEGER REFERENCES ee88_agents(id) ON DELETE CASCADE,
  UNIQUE(hub_user_id, ee88_agent_id)
);

-- Trạng thái cache
CREATE TABLE cache_status (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  agent_id      INTEGER REFERENCES ee88_agents(id),
  endpoint      TEXT NOT NULL,
  cache_date    TEXT,                    -- YYYY-MM-DD
  is_locked     INTEGER DEFAULT 0,      -- 1 = ngày cũ, data cố định
  record_count  INTEGER DEFAULT 0,
  cached_at     DATETIME,
  UNIQUE(agent_id, endpoint, cache_date)
);
```

---

## Bảng dữ liệu (10 bảng)

### 1. members (không có date)
```sql
CREATE TABLE members (
  id INTEGER, agent_id INTEGER NOT NULL,
  username TEXT, type INTEGER, type_format TEXT,
  parent_user TEXT, money TEXT,
  deposit_count INTEGER, deposit_amount TEXT,
  withdrawal_count INTEGER, withdrawal_amount TEXT,
  login_time TEXT, register_time TEXT,
  status INTEGER, status_format TEXT,
  first_deposit_time TEXT, login_ip TEXT, register_ip TEXT,
  truename TEXT, phone TEXT, invite_code TEXT, uid INTEGER,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, agent_id)
);
```

### 2. invite_codes (không có date bắt buộc)
```sql
CREATE TABLE invite_codes (
  id INTEGER, agent_id INTEGER NOT NULL,
  uid INTEGER, invite_code TEXT, group_id INTEGER,
  user_type TEXT, rebate_arr TEXT,
  reg_count INTEGER, remark TEXT, create_time TEXT,
  recharge_count INTEGER, first_recharge_count INTEGER,
  register_recharge_count INTEGER, scope_reg_count INTEGER,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, agent_id)
);
```

### 3. bank_accounts (không có date)
```sql
CREATE TABLE bank_accounts (
  id INTEGER, agent_id INTEGER NOT NULL,
  is_default INTEGER, bank TEXT, branch TEXT,
  card_number TEXT, create_time TEXT,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, agent_id)
);
```

### 4. report_lottery (date: "date")
```sql
CREATE TABLE report_lottery (
  agent_id INTEGER NOT NULL, uid INTEGER,
  lottery_id TEXT, bet_count TEXT, bet_amount TEXT,
  valid_amount TEXT, rebate_amount TEXT, result TEXT,
  win_lose TEXT, prize TEXT, username TEXT,
  user_parent_format TEXT, lottery_name TEXT,
  report_date TEXT NOT NULL,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agent_id, uid, lottery_id, report_date)
);
```

### 5. report_funds (date: "date")
```sql
CREATE TABLE report_funds (
  id INTEGER, agent_id INTEGER NOT NULL, uid INTEGER,
  date TEXT, deposit_count INTEGER, deposit_amount TEXT,
  withdrawal_count INTEGER, withdrawal_amount TEXT,
  charge_fee TEXT, agent_commission TEXT, promotion TEXT,
  third_rebate TEXT, username TEXT, user_parent_format TEXT,
  third_activity_amount INTEGER,
  report_date TEXT NOT NULL,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agent_id, uid, report_date)
);
```

### 6. report_third_game (date: "date")
```sql
CREATE TABLE report_third_game (
  agent_id INTEGER NOT NULL, uid INTEGER,
  platform_id INTEGER, t_bet_amount TEXT, t_bet_times TEXT,
  t_turnover TEXT, t_prize TEXT, t_win_lose TEXT,
  username TEXT, platform_id_name TEXT,
  report_date TEXT NOT NULL,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (agent_id, uid, platform_id, report_date)
);
```

### 7. deposit_withdrawals (date: "create_time")
```sql
CREATE TABLE deposit_withdrawals (
  id INTEGER, agent_id INTEGER NOT NULL,
  serial_no TEXT, uid INTEGER, username TEXT,
  user_parent_format TEXT, amount TEXT, true_amount TEXT,
  firm_fee TEXT, user_fee TEXT, rebate TEXT,
  type TEXT, status TEXT, name TEXT, account TEXT, branch TEXT,
  create_time TEXT, success_time TEXT,
  transaction_date TEXT NOT NULL,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, agent_id)
);
```

### 8. withdrawal_records (date: "create_time")
```sql
CREATE TABLE withdrawal_records (
  id INTEGER, agent_id INTEGER NOT NULL,
  serial_no TEXT, uid INTEGER, username TEXT,
  user_parent_format TEXT, amount TEXT, true_amount TEXT,
  user_fee TEXT, status INTEGER, status_format TEXT,
  create_time TEXT, success_time TEXT,
  record_date TEXT NOT NULL,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, agent_id)
);
```

### 9. lottery_bets (date: "create_time")
```sql
CREATE TABLE lottery_bets (
  id INTEGER, agent_id INTEGER NOT NULL,
  serial_no TEXT, uid INTEGER, username TEXT,
  lottery_id INTEGER, lottery_name TEXT,
  play_type_id INTEGER, play_type_name TEXT,
  play_id INTEGER, play_name TEXT,
  issue TEXT, content TEXT, money TEXT, odds TEXT,
  rebate TEXT, rebate_amount TEXT, result TEXT, prize TEXT,
  status INTEGER, status_text TEXT,
  create_time TEXT, prize_time TEXT,
  bet_date TEXT NOT NULL,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, agent_id)
);
```

### 10. third_party_bets (date: "bet_time")
```sql
CREATE TABLE third_party_bets (
  id INTEGER, agent_id INTEGER NOT NULL,
  uid INTEGER, platform_id INTEGER, platform_id_name TEXT,
  serial_no TEXT, platform_username TEXT,
  bet_amount TEXT, turnover TEXT, prize TEXT, win_lose TEXT,
  bet_time TEXT, game_name TEXT, c_name TEXT, cid INTEGER,
  bet_date TEXT NOT NULL,
  cached_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, agent_id)
);
```

---

## Indexes

```sql
CREATE INDEX idx_members_username ON members(username);
CREATE INDEX idx_members_agent ON members(agent_id);
CREATE INDEX idx_bets_date ON lottery_bets(bet_date, agent_id);
CREATE INDEX idx_third_bets_date ON third_party_bets(bet_date, agent_id);
CREATE INDEX idx_deposit_date ON deposit_withdrawals(transaction_date, agent_id);
CREATE INDEX idx_withdrawal_date ON withdrawal_records(record_date, agent_id);
CREATE INDEX idx_report_lottery_date ON report_lottery(report_date, agent_id);
CREATE INDEX idx_report_funds_date ON report_funds(report_date, agent_id);
CREATE INDEX idx_report_third_date ON report_third_game(report_date, agent_id);
CREATE INDEX idx_cache_status ON cache_status(agent_id, endpoint, cache_date);
```

---

## Quy tắc cache

| Ngày                      | Hành vi                                      |
| ------------------------- | -------------------------------------------- |
| Hôm nay                   | Luôn gọi API ee88 real-time, KHÔNG cache     |
| Hôm qua trở về trước      | Cache vào SQLite, `is_locked = 1`            |
| Ngày đã locked            | Query từ DB, KHÔNG gọi API ee88              |
