-- SANDBOT SERVER — Supabase Setup Script
-- Chạy toàn bộ file này trong Supabase Dashboard → SQL Editor → New Query → Run

-- Bảng thiết bị người dùng
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  first_seen BIGINT NOT NULL,
  last_seen BIGINT,
  version TEXT DEFAULT '1.1.1',
  platform TEXT DEFAULT 'windows',
  is_blocked INTEGER DEFAULT 0,
  blocked_reason TEXT DEFAULT '',
  msg_count_today INTEGER DEFAULT 0,
  msg_date TEXT DEFAULT '',
  msg_limit INTEGER DEFAULT 150,
  total_messages INTEGER DEFAULT 0,
  notes TEXT DEFAULT ''
);

-- Bảng thông báo
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

-- Bảng lỗi
CREATE TABLE IF NOT EXISTS errors (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT,
  error_type TEXT,
  message TEXT,
  stack TEXT,
  ts BIGINT NOT NULL
);

-- Bảng admin
CREATE TABLE IF NOT EXISTS admins (
  id BIGSERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_devices_blocked ON devices(is_blocked);
CREATE INDEX IF NOT EXISTS idx_devices_last_seen ON devices(last_seen);
CREATE INDEX IF NOT EXISTS idx_errors_ts ON errors(ts);
CREATE INDEX IF NOT EXISTS idx_notifs_target ON notifications(target);
CREATE INDEX IF NOT EXISTS idx_notifs_created ON notifications(created_at);

-- Tắt RLS (Row Level Security) cho tất cả bảng
-- Server dùng service key nên bypass RLS nhưng tắt cho chắc
ALTER TABLE devices DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE errors DISABLE ROW LEVEL SECURITY;
ALTER TABLE admins DISABLE ROW LEVEL SECURITY;
