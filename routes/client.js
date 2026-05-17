// Routes called by Sandbot desktop app
const router = require('express').Router();
const { getDB } = require('../db/database');
const crypto = require('crypto');
const SHARED_SECRET = process.env.CLIENT_SECRET || 'sandbot-shared-secret-2024';

function verifyClientRequest(req, res, next) {
  const signature = req.headers['x-sandbot-sig'];
  const timestamp = req.headers['x-sandbot-ts'];

  if (!signature || !timestamp) {
    return res.status(401).json({ error: 'Missing signature' });
  }

  const parsedTimestamp = Number.parseInt(timestamp, 10);
  if (Number.isNaN(parsedTimestamp)) {
    return res.status(401).json({ error: 'Invalid timestamp' });
  }

  const age = Date.now() - parsedTimestamp;
  if (age > 30000 || age < -5000) {
    return res.status(401).json({ error: 'Request expired' });
  }

  const payload = timestamp + JSON.stringify(req.body || {});
  const expected = crypto
    .createHmac('sha256', SHARED_SECRET)
    .update(payload)
    .digest('hex');

  const signatureBuffer = Buffer.from(signature, 'hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  next();
}

router.use(verifyClientRequest);

// Register/heartbeat — app calls this on startup and periodically
router.post('/heartbeat', (req, res) => {
  const db = getDB();
  const { deviceId, version, platform } = req.body;
  if(!deviceId) return res.status(400).json({error:'Missing deviceId'});

  const now = Date.now();
  const existing = db.prepare('SELECT * FROM devices WHERE id=?').get(deviceId);
  if(!existing) {
    db.prepare('INSERT INTO devices (id,first_seen,last_seen,version,platform) VALUES (?,?,?,?,?)')
      .run(deviceId, now, now, version||'1.1.1', platform||'windows');
  } else {
    db.prepare('UPDATE devices SET last_seen=?,version=? WHERE id=?').run(now, version||existing.version, deviceId);
  }

  const device = db.prepare('SELECT * FROM devices WHERE id=?').get(deviceId);
  const today = new Date().toISOString().slice(0,10);

  // Get unread notifications for this device
  const notifs = db.prepare(`
    SELECT * FROM notifications 
    WHERE (target='all' OR target=?) 
    AND (expires_at=0 OR expires_at>?)
    ORDER BY created_at DESC LIMIT 20
  `).all(deviceId, now);

  res.json({
    ok: true,
    blocked: device.is_blocked === 1,
    blockedReason: device.blocked_reason || '',
    msgLimit: device.msg_limit,
    msgCountToday: device.msg_date === today ? device.msg_count_today : 0,
    notifications: notifs.map(n => ({
      id: n.id, type: n.type, title: n.title, body: n.body,
      version: n.version, updateUrl: n.update_url, sizeMB: n.size_mb,
      ts: n.created_at
    })),
    serverVersion: '1.0.0'
  });
});

// Track message sent
router.post('/track', (req, res) => {
  const db = getDB();
  const { deviceId } = req.body;
  if(!deviceId) return res.status(400).json({error:'Missing deviceId'});
  const today = new Date().toISOString().slice(0,10);
  const d = db.prepare('SELECT * FROM devices WHERE id=?').get(deviceId);
  if(!d) return res.status(404).json({error:'Device not found'});
  if(d.is_blocked) return res.json({ok:false,blocked:true});

  const newCount = d.msg_date === today ? d.msg_count_today + 1 : 1;
  db.prepare('UPDATE devices SET msg_count_today=?,msg_date=?,total_messages=total_messages+1 WHERE id=?')
    .run(newCount, today, deviceId);
  res.json({ ok: true, count: newCount, limit: d.msg_limit, remaining: d.msg_limit - newCount });
});

// Report error
router.post('/error', (req, res) => {
  const db = getDB();
  const { deviceId, errorType, message, stack } = req.body;
  db.prepare('INSERT INTO errors (device_id,error_type,message,stack,ts) VALUES (?,?,?,?,?)')
    .run(deviceId||'unknown', errorType||'unknown', message||'', stack||'', Date.now());
  res.json({ ok: true });
});

module.exports = router;
