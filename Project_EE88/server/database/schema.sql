-- Hub Users: tài khoản đăng nhập Agent Hub
CREATE TABLE IF NOT EXISTS hub_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
  status INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now', 'localtime')),
  updated_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- EE88 Agents: tài khoản ee88 (N agents)
CREATE TABLE IF NOT EXISTS ee88_agents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  base_url TEXT NOT NULL,
  cookie TEXT NOT NULL,
  status INTEGER NOT NULL DEFAULT 1,
  last_check TEXT,
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
