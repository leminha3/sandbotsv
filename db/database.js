// db/database.js — Dùng Supabase (PostgreSQL) thay SQLite
// SQLite không chạy được trên Vercel serverless
const { createClient } = require('@supabase/supabase-js');
const bcrypt = require('bcryptjs');

let supabase = null;

async function initDB() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment variables');
  }

  supabase = createClient(url, key);

  // Create tables if not exist (Supabase SQL editor hoặc migration)
  // Tables phải được tạo trước qua Supabase dashboard
  // Xem file SETUP.md để biết cách tạo

  // Create default admin if none exists
  const { data: admins } = await supabase.from('admins').select('id').limit(1);
  if (!admins || admins.length === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'sandbot2024!', 10);
    await supabase.from('admins').insert({
      username: process.env.ADMIN_USER || 'admin',
      password_hash: hash,
      created_at: Date.now()
    });
    console.log('Default admin created');
  }

  return supabase;
}

function getDB() {
  if (!supabase) throw new Error('DB not initialized. Call initDB() first.');
  return supabase;
}

module.exports = { initDB, getDB };
