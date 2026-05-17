const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const DB_PATH = path.join(__dirname, '../sandbot.db');
let db;

function initDB() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      first_seen INTEGER NOT NULL,
      last_seen INTEGER,
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
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      version TEXT DEFAULT '',
      update_url TEXT DEFAULT '',
      size_mb REAL DEFAULT 0,
      target TEXT DEFAULT 'all',
      created_at INTEGER NOT NULL,
      expires_at INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT,
      error_type TEXT,
      message TEXT,
      stack TEXT,
      ts INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  const c = db.prepare('SELECT COUNT(*) as c FROM admins').get();
  if(c.c === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'sandbot2024!', 10);
    db.prepare('INSERT INTO admins (username,password_hash,created_at) VALUES (?,?,?)')
      .run(process.env.ADMIN_USER || 'admin', hash, Date.now());
    console.log('Admin created: admin / sandbot2024! — CHANGE THIS!');
  }
  return db;
}
function getDB() { return db; }
module.exports = { initDB, getDB };
