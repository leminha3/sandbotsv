// routes/admin.js - Supabase admin API
const router = require('express').Router();
const { getDB } = require('../db/database');
const { adminAuth } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');

const SECRET = process.env.JWT_SECRET || 'sandbot-jwt-secret-change-me';
const DEFAULT_MSG_LIMIT = Number.parseInt(process.env.DEFAULT_MSG_LIMIT || '100', 10);

function parseLimit(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function updateDevice(db, deviceId, patch) {
  const { data, error } = await db.from('devices').update(patch).eq('id', deviceId).select('id').limit(1);
  if (error) throw error;
  if (!data?.length) {
    const notFound = new Error('Device not found or id does not match');
    notFound.statusCode = 404;
    throw notFound;
  }
  return data[0];
}

function sendError(res, error, fallback = 'Request failed') {
  res.status(error.statusCode || 500).json({ error: error.message || fallback });
}

router.post('/login', async (req, res) => {
  try {
    const db = getDB();
    const { username, password } = req.body;
    const { data: admins, error } = await db.from('admins').select('*').eq('username', username).limit(1);
    if (error) throw error;
    const admin = admins?.[0];
    if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Sai username hoac password' });
    }
    const token = jwt.sign({ id: admin.id, username }, SECRET, { expiresIn: '24h' });
    res.json({ token, username });
  } catch (error) {
    sendError(res, error, 'Login failed');
  }
});

router.use(adminAuth);

router.get('/stats', async (req, res) => {
  try {
    const db = getDB();
    const [
      { count: totalDevices, error: totalDevicesError },
      { count: activeToday, error: activeTodayError },
      { count: blocked, error: blockedError },
      { data: msgData, error: msgError },
      { count: recentErrors, error: recentErrorsError },
      { count: totalNotifs, error: totalNotifsError }
    ] = await Promise.all([
      db.from('devices').select('*', { count: 'exact', head: true }),
      db.from('devices').select('*', { count: 'exact', head: true }).gt('last_seen', Date.now() - 86400000),
      db.from('devices').select('*', { count: 'exact', head: true }).eq('is_blocked', 1),
      db.from('devices').select('total_messages,msg_count_today,msg_date'),
      db.from('errors').select('*', { count: 'exact', head: true }).gt('ts', Date.now() - 86400000),
      db.from('notifications').select('*', { count: 'exact', head: true })
    ]);

    const firstError = totalDevicesError || activeTodayError || blockedError || msgError || recentErrorsError || totalNotifsError;
    if (firstError) throw firstError;

    const today = new Date().toISOString().slice(0, 10);
    const totalMsgs = (msgData || []).reduce((sum, device) => {
      const total = device.total_messages || 0;
      const todayCount = device.msg_date === today ? (device.msg_count_today || 0) : 0;
      return sum + Math.max(total, todayCount);
    }, 0);

    res.json({ totalDevices, activeToday, blocked, totalMsgs, recentErrors, totalNotifs });
  } catch (error) {
    sendError(res, error, 'Stats failed');
  }
});

router.get('/devices', async (req, res) => {
  try {
    const db = getDB();
    const { search, blocked, page = 1, limit = 100 } = req.query;
    const pageSize = Math.min(Math.max(parseLimit(limit) ?? 100, 1), 500);
    const currentPage = Math.max(parseLimit(page) ?? 1, 1);
    const from = (currentPage - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = db.from('devices').select('*', { count: 'exact' }).order('last_seen', { ascending: false }).range(from, to);
    if (search) query = query.ilike('id', `%${search}%`);
    if (blocked !== undefined) query = query.eq('is_blocked', blocked === 'true' ? 1 : 0);

    const { data: devices, count, error } = await query;
    if (error) throw error;
    res.json({ devices: devices || [], total: count || 0, page: currentPage });
  } catch (error) {
    sendError(res, error, 'Devices failed');
  }
});

router.get('/devices/:id', async (req, res) => {
  try {
    const db = getDB();
    const { data: devArr, error: deviceError } = await db.from('devices').select('*').eq('id', req.params.id).limit(1);
    if (deviceError) throw deviceError;
    if (!devArr?.length) return res.status(404).json({ error: 'Not found' });
    const { data: errors, error: errorsError } = await db.from('errors').select('*').eq('device_id', req.params.id).order('ts', { ascending: false }).limit(20);
    if (errorsError) throw errorsError;
    res.json({ device: devArr[0], errors: errors || [] });
  } catch (error) {
    sendError(res, error, 'Device detail failed');
  }
});

router.post('/devices/:id/block', async (req, res) => {
  try {
    const db = getDB();
    const { reason } = req.body;
    await updateDevice(db, req.params.id, { is_blocked: 1, blocked_reason: reason || 'Blocked by admin' });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, 'Block failed');
  }
});

router.post('/devices/:id/unblock', async (req, res) => {
  try {
    const db = getDB();
    await updateDevice(db, req.params.id, { is_blocked: 0, blocked_reason: '' });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, 'Unblock failed');
  }
});

router.post('/devices/:id/limit', async (req, res) => {
  try {
    const db = getDB();
    const limit = parseLimit(req.body.limit);
    if (limit === null) return res.status(400).json({ error: 'Invalid limit' });
    await updateDevice(db, req.params.id, { msg_limit: limit });
    res.json({ ok: true, msgLimit: limit, limit });
  } catch (error) {
    sendError(res, error, 'Limit update failed');
  }
});

router.post('/devices/:id/notes', async (req, res) => {
  try {
    const db = getDB();
    await updateDevice(db, req.params.id, { notes: req.body.notes || '' });
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, 'Notes update failed');
  }
});

router.get('/notifications', async (req, res) => {
  try {
    const db = getDB();
    const { data, error } = await db.from('notifications').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    res.json({ notifications: data || [] });
  } catch (error) {
    sendError(res, error, 'Notifications failed');
  }
});

router.post('/notifications', async (req, res) => {
  try {
    const db = getDB();
    const { type, title, body, version, updateUrl, sizeMB, target, expiresInHours } = req.body;
    if (!type || !title) return res.status(400).json({ error: 'type and title required' });
    const now = Date.now();
    const cleanTarget = String(target || 'all').trim() || 'all';
    const expiresHours = Number(expiresInHours);
    const id = randomUUID();
    const { error } = await db.from('notifications').insert({
      id,
      type,
      title,
      body: body || '',
      version: version || '',
      update_url: updateUrl || '',
      size_mb: Number.parseFloat(sizeMB) || 0,
      target: cleanTarget,
      created_at: now,
      expires_at: Number.isFinite(expiresHours) && expiresHours > 0 ? now + expiresHours * 3600000 : 0
    });
    if (error) throw error;
    res.json({ ok: true, id, target: cleanTarget });
  } catch (error) {
    sendError(res, error, 'Notification create failed');
  }
});

router.delete('/notifications/:id', async (req, res) => {
  try {
    const db = getDB();
    const { error } = await db.from('notifications').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, 'Notification delete failed');
  }
});

router.get('/errors', async (req, res) => {
  try {
    const db = getDB();
    const { data, error } = await db.from('errors').select('*').order('ts', { ascending: false }).limit(200);
    if (error) throw error;
    res.json({ errors: data || [] });
  } catch (error) {
    sendError(res, error, 'Errors failed');
  }
});

router.delete('/errors', async (req, res) => {
  try {
    const db = getDB();
    const { error } = await db.from('errors').delete().neq('id', 0);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, 'Errors delete failed');
  }
});

router.post('/global/msg-limit', async (req, res) => {
  try {
    const db = getDB();
    const limit = parseLimit(req.body.limit);
    if (limit === null) return res.status(400).json({ error: 'Invalid limit' });
    const { data, error } = await db.from('devices').update({ msg_limit: limit }).neq('id', '').select('id');
    if (error) throw error;
    res.json({ ok: true, msgLimit: limit, limit, updated: data?.length || 0 });
  } catch (error) {
    sendError(res, error, 'Global limit update failed');
  }
});

router.post('/global/block-all', async (req, res) => {
  try {
    const db = getDB();
    const { data, error } = await db.from('devices').update({ is_blocked: 1, blocked_reason: 'Maintenance' }).neq('id', '').select('id');
    if (error) throw error;
    res.json({ ok: true, updated: data?.length || 0 });
  } catch (error) {
    sendError(res, error, 'Global block failed');
  }
});

router.post('/global/unblock-all', async (req, res) => {
  try {
    const db = getDB();
    const { data, error } = await db.from('devices').update({ is_blocked: 0, blocked_reason: '' }).neq('id', '').select('id');
    if (error) throw error;
    res.json({ ok: true, updated: data?.length || 0 });
  } catch (error) {
    sendError(res, error, 'Global unblock failed');
  }
});

router.post('/control', async (req, res) => {
  try {
    const db = getDB();
    const { deviceId, action, reason, limit } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

    if (action === 'block') {
      await updateDevice(db, deviceId, { is_blocked: 1, blocked_reason: reason || 'Blocked by admin' });
    } else if (action === 'unblock') {
      await updateDevice(db, deviceId, { is_blocked: 0, blocked_reason: '' });
    } else if (action === 'limit') {
      const parsedLimit = parseLimit(limit);
      if (parsedLimit === null) return res.status(400).json({ error: 'Invalid limit' });
      await updateDevice(db, deviceId, { msg_limit: parsedLimit });
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, 'Control failed');
  }
});

router.get('/config', (req, res) => {
  res.json({ defaultMsgLimit: DEFAULT_MSG_LIMIT });
});

router.post('/change-password', async (req, res) => {
  try {
    const db = getDB();
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) return res.status(400).json({ error: 'Password too short' });
    const hash = bcrypt.hashSync(newPassword, 10);
    const { error } = await db.from('admins').update({ password_hash: hash }).eq('id', req.admin.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    sendError(res, error, 'Password update failed');
  }
});

module.exports = router;
