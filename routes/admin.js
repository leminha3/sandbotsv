// routes/admin.js — Supabase version
const router = require('express').Router();
const { getDB } = require('../db/database');
const { adminAuth } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const SECRET = process.env.JWT_SECRET || 'sandbot-jwt-secret-change-me';

// ── Login ──────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const db = getDB();
  const { username, password } = req.body;
  const { data: admins } = await db.from('admins').select('*').eq('username', username).limit(1);
  const admin = admins?.[0];
  if (!admin || !bcrypt.compareSync(password, admin.password_hash))
    return res.status(401).json({ error: 'Sai username hoặc password' });
  const token = jwt.sign({ id: admin.id, username }, SECRET, { expiresIn: '24h' });
  res.json({ token, username });
});

router.use(adminAuth);

// ── Stats ──────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const db = getDB();
  const [
    { count: totalDevices },
    { count: activeToday },
    { count: blocked },
    { data: msgData },
    { count: recentErrors },
    { count: totalNotifs }
  ] = await Promise.all([
    db.from('devices').select('*', { count: 'exact', head: true }),
    db.from('devices').select('*', { count: 'exact', head: true }).gt('last_seen', Date.now() - 86400000),
    db.from('devices').select('*', { count: 'exact', head: true }).eq('is_blocked', 1),
    db.from('devices').select('total_messages'),
    db.from('errors').select('*', { count: 'exact', head: true }).gt('ts', Date.now() - 86400000),
    db.from('notifications').select('*', { count: 'exact', head: true })
  ]);
  const totalMsgs = (msgData || []).reduce((s, d) => s + (d.total_messages || 0), 0);
  res.json({ totalDevices, activeToday, blocked, totalMsgs, recentErrors, totalNotifs });
});

// ── Devices ────────────────────────────────────────────────────────────────
router.get('/devices', async (req, res) => {
  const db = getDB();
  const { search, blocked, page = 1, limit = 100 } = req.query;
  const from = (parseInt(page) - 1) * parseInt(limit);
  const to = from + parseInt(limit) - 1;

  let query = db.from('devices').select('*', { count: 'exact' }).order('last_seen', { ascending: false }).range(from, to);
  if (search) query = query.ilike('id', `%${search}%`);
  if (blocked !== undefined) query = query.eq('is_blocked', blocked === 'true' ? 1 : 0);

  const { data: devices, count } = await query;
  res.json({ devices: devices || [], total: count || 0, page: parseInt(page) });
});

router.get('/devices/:id', async (req, res) => {
  const db = getDB();
  const { data: devArr } = await db.from('devices').select('*').eq('id', req.params.id).limit(1);
  if (!devArr?.length) return res.status(404).json({ error: 'Not found' });
  const { data: errors } = await db.from('errors').select('*').eq('device_id', req.params.id).order('ts', { ascending: false }).limit(20);
  res.json({ device: devArr[0], errors: errors || [] });
});

router.post('/devices/:id/block', async (req, res) => {
  const db = getDB();
  const { reason } = req.body;
  await db.from('devices').update({ is_blocked: 1, blocked_reason: reason || 'Blocked by admin' }).eq('id', req.params.id);
  res.json({ ok: true });
});

router.post('/devices/:id/unblock', async (req, res) => {
  const db = getDB();
  await db.from('devices').update({ is_blocked: 0, blocked_reason: '' }).eq('id', req.params.id);
  res.json({ ok: true });
});

router.post('/devices/:id/limit', async (req, res) => {
  const db = getDB();
  const { limit } = req.body;
  if (!limit || isNaN(limit)) return res.status(400).json({ error: 'Invalid limit' });
  await db.from('devices').update({ msg_limit: parseInt(limit) }).eq('id', req.params.id);
  res.json({ ok: true });
});

router.post('/devices/:id/notes', async (req, res) => {
  const db = getDB();
  await db.from('devices').update({ notes: req.body.notes || '' }).eq('id', req.params.id);
  res.json({ ok: true });
});

// ── Notifications ──────────────────────────────────────────────────────────
router.get('/notifications', async (req, res) => {
  const db = getDB();
  const { data } = await db.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
  res.json({ notifications: data || [] });
});

router.post('/notifications', async (req, res) => {
  const db = getDB();
  const { type, title, body, version, updateUrl, sizeMB, target, expiresInHours } = req.body;
  if (!type || !title) return res.status(400).json({ error: 'type and title required' });
  const now = Date.now();
  await db.from('notifications').insert({
    id: randomUUID(), type, title,
    body: body || '', version: version || '',
    update_url: updateUrl || '', size_mb: sizeMB || 0,
    target: target || 'all', created_at: now,
    expires_at: expiresInHours ? now + expiresInHours * 3600000 : 0
  });
  res.json({ ok: true });
});

router.delete('/notifications/:id', async (req, res) => {
  const db = getDB();
  await db.from('notifications').delete().eq('id', req.params.id);
  res.json({ ok: true });
});

// ── Errors ─────────────────────────────────────────────────────────────────
router.get('/errors', async (req, res) => {
  const db = getDB();
  const { data } = await db.from('errors').select('*').order('ts', { ascending: false }).limit(200);
  res.json({ errors: data || [] });
});

router.delete('/errors', async (req, res) => {
  const db = getDB();
  await db.from('errors').delete().neq('id', 0);
  res.json({ ok: true });
});

// ── Global ─────────────────────────────────────────────────────────────────
router.post('/global/msg-limit', async (req, res) => {
  const db = getDB();
  const { limit } = req.body;
  if (!limit || isNaN(limit)) return res.status(400).json({ error: 'Invalid limit' });
  await db.from('devices').update({ msg_limit: parseInt(limit) }).neq('id', '');
  res.json({ ok: true });
});

router.post('/global/block-all', async (req, res) => {
  const db = getDB();
  await db.from('devices').update({ is_blocked: 1, blocked_reason: 'Maintenance' }).neq('id', '');
  res.json({ ok: true });
});

router.post('/global/unblock-all', async (req, res) => {
  const db = getDB();
  await db.from('devices').update({ is_blocked: 0, blocked_reason: '' }).neq('id', '');
  res.json({ ok: true });
});

router.post('/change-password', async (req, res) => {
  const db = getDB();
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password too short' });
  const hash = bcrypt.hashSync(newPassword, 10);
  await db.from('admins').update({ password_hash: hash }).eq('id', req.admin.id);
  res.json({ ok: true });
});

module.exports = router;
