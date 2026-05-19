-- SANDBOT SERVER - Supabase setup script
-- Run this file in Supabase Dashboard -> SQL Editor -> New Query -> Run.

CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  first_seen BIGINT NOT NULL,
  last_seen BIGINT,
  version TEXT DEFAULT '1.1.1',
  platform TEXT DEFAULT 'Windows',
  is_blocked INTEGER DEFAULT 0,
  blocked_reason TEXT DEFAULT '',
  msg_count_today INTEGER DEFAULT 0,
  msg_date TEXT DEFAULT '',
  msg_limit INTEGER DEFAULT 100,
  total_messages INTEGER DEFAULT 0,
  notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT DEFAULT '',
  version TEXT DEFAULT '',
  update_url TEXT DEFAULT '',
  size_mb REAL DEFAULT 0,
  target TEXT DEFAULT 'all',
  created_at BIGINT NOT NULL,
  expires_at BIGINT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS errors (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT,
  error_type TEXT,
  message TEXT,
  stack TEXT,
  ts BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

-- Keep older databases in sync with the current server defaults.
ALTER TABLE devices ALTER COLUMN msg_limit SET DEFAULT 100;
ALTER TABLE devices ALTER COLUMN platform SET DEFAULT 'Windows';

CREATE INDEX IF NOT EXISTS idx_devices_blocked ON devices(is_blocked);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
CREATE INDEX IF NOT EXISTS idx_errors_ts ON errors(ts);
CREATE INDEX IF NOT EXISTS idx_notifs_target ON notifications(target);
CREATE INDEX IF NOT EXISTS idx_notifs_created ON notifications(created_at);

ALTER TABLE devices DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE errors DISABLE ROW LEVEL SECURITY;
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;
