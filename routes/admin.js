// Admin-only routes
const router = require('express').Router();
const { getDB } = require('../db/database');
const { adminAuth } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const SECRET = process.env.JWT_SECRET || 'sandbot-jwt-secret-change-me';

// ── Auth ───────────────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const db = getDB();
  const { username, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE username=?').get(username);
  if(!admin || !bcrypt.compareSync(password, admin.password_hash))
    return res.status(401).json({error:'Sai username hoặc password'});
  const token = jwt.sign({ id: admin.id, username }, SECRET, { expiresIn: '24h' });
  res.json({ token, username });
});

// All routes below require admin auth
router.use(adminAuth);

// ── Dashboard stats ────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const db = getDB();
  const totalDevices = db.prepare('SELECT COUNT(*) as c FROM devices').get().c;
  const activeToday = db.prepare("SELECT COUNT(*) as c FROM devices WHERE last_seen>?").get(Date.now()-86400000).c;
  const blocked = db.prepare('SELECT COUNT(*) as c FROM devices WHERE is_blocked=1').get().c;
  const totalMsgs = db.prepare('SELECT SUM(total_messages) as s FROM devices').get().s || 0;
  const recentErrors = db.prepare('SELECT COUNT(*) as c FROM errors WHERE ts>?').get(Date.now()-86400000).c;
  const totalNotifs = db.prepare('SELECT COUNT(*) as c FROM notifications').get().c;
  res.json({ totalDevices, activeToday, blocked, totalMsgs, recentErrors, totalNotifs });
});

// ── Devices ────────────────────────────────────────────────────────────────
router.get('/devices', (req, res) => {
  const db = getDB();
  const { search, blocked, page=1, limit=50 } = req.query;
  let sql = 'SELECT * FROM devices WHERE 1=1';
  const params = [];
  if(search){ sql+=' AND id LIKE ?'; params.push('%'+search+'%'); }
  if(blocked!==undefined){ sql+=' AND is_blocked=?'; params.push(blocked==='true'?1:0); }
  sql += ' ORDER BY last_seen DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), (parseInt(page)-1)*parseInt(limit));
  const devices = db.prepare(sql).all(...params);
  const total = db.prepare('SELECT COUNT(*) as c FROM devices').get().c;
  res.json({ devices, total, page: parseInt(page) });
});

router.get('/devices/:id', (req, res) => {
  const db = getDB();
  const device = db.prepare('SELECT * FROM devices WHERE id=?').get(req.params.id);
  if(!device) return res.status(404).json({error:'Not found'});
  const errors = db.prepare('SELECT * FROM errors WHERE device_id=? ORDER BY ts DESC LIMIT 20').all(req.params.id);
  res.json({ device, errors });
});

// Block / unblock device
router.post('/devices/:id/block', (req, res) => {
  const db = getDB();
  const { reason } = req.body;
  db.prepare('UPDATE devices SET is_blocked=1,blocked_reason=? WHERE id=?').run(reason||'Blocked by admin', req.params.id);
  res.json({ ok: true });
});

router.post('/devices/:id/unblock', (req, res) => {
  const db = getDB();
  db.prepare('UPDATE devices SET is_blocked=0,blocked_reason="" WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Update msg limit for device
router.post('/devices/:id/limit', (req, res) => {
  const db = getDB();
  const { limit } = req.body;
  if(!limit || isNaN(limit)) return res.status(400).json({error:'Invalid limit'});
  db.prepare('UPDATE devices SET msg_limit=? WHERE id=?').run(parseInt(limit), req.params.id);
  res.json({ ok: true });
});

// Update notes
router.post('/devices/:id/notes', (req, res) => {
  const db = getDB();
  db.prepare('UPDATE devices SET notes=? WHERE id=?').run(req.body.notes||'', req.params.id);
  res.json({ ok: true });
});

// ── Notifications ──────────────────────────────────────────────────────────
router.get('/notifications', (req, res) => {
  const db = getDB();
  const notifs = db.prepare('SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100').all();
  res.json({ notifications: notifs });
});

router.post('/notifications', (req, res) => {
  const db = getDB();
  const { type, title, body, version, updateUrl, sizeMB, target, expiresInHours } = req.body;
  if(!type||!title) return res.status(400).json({error:'type and title required'});
  const id = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = expiresInHours ? now + expiresInHours*3600000 : 0;
  db.prepare(`INSERT INTO notifications (id,type,title,body,version,update_url,size_mb,target,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, type, title, body||'', version||'', updateUrl||'', sizeMB||0, target||'all', now, expiresAt);
  res.json({ ok: true, id });
});

router.delete('/notifications/:id', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM notifications WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// ── Errors ─────────────────────────────────────────────────────────────────
router.get('/errors', (req, res) => {
  const db = getDB();
  const errors = db.prepare('SELECT * FROM errors ORDER BY ts DESC LIMIT 200').all();
  res.json({ errors });
});

router.delete('/errors', (req, res) => {
  const db = getDB();
  db.prepare('DELETE FROM errors').run();
  res.json({ ok: true });
});

// ── Global settings ────────────────────────────────────────────────────────
router.post('/global/msg-limit', (req, res) => {
  const db = getDB();
  const { limit } = req.body;
  if(!limit||isNaN(limit)) return res.status(400).json({error:'Invalid limit'});
  db.prepare('UPDATE devices SET msg_limit=?').run(parseInt(limit));
  res.json({ ok: true, updated: db.prepare('SELECT changes() as c').get().c });
});

router.post('/global/block-all', (req, res) => {
  const db = getDB();
  db.prepare("UPDATE devices SET is_blocked=1,blocked_reason='Maintenance'").run();
  res.json({ ok: true });
});

router.post('/global/unblock-all', (req, res) => {
  const db = getDB();
  db.prepare("UPDATE devices SET is_blocked=0,blocked_reason=''").run();
  res.json({ ok: true });
});

// Change admin password
router.post('/change-password', (req, res) => {
  const db = getDB();
  const { newPassword } = req.body;
  if(!newPassword||newPassword.length<8) return res.status(400).json({error:'Password too short'});
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE admins SET password_hash=? WHERE id=?').run(hash, req.admin.id);
  res.json({ ok: true });
});

module.exports = router;
