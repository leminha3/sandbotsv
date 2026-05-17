// routes/client.js — Supabase version
const router = require('express').Router();
const { getDB } = require('../db/database');

router.post('/heartbeat', async (req, res) => {
  const db = getDB();
  const { deviceId, version, platform } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  const now = Date.now();
  const { data: existing } = await db.from('devices').select('*').eq('id', deviceId).limit(1);

  if (!existing?.length) {
    await db.from('devices').insert({
      id: deviceId, first_seen: now, last_seen: now,
      version: version || '1.1.1', platform: platform || 'windows'
    });
  } else {
    await db.from('devices').update({ last_seen: now, version: version || existing[0].version }).eq('id', deviceId);
  }

  const { data: devArr } = await db.from('devices').select('*').eq('id', deviceId).limit(1);
  const device = devArr?.[0];
  const today = new Date().toISOString().slice(0, 10);

  const { data: notifs } = await db.from('notifications')
    .select('*')
    .or(`target.eq.all,target.eq.${deviceId}`)
    .or(`expires_at.eq.0,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(20);

  res.json({
    ok: true,
    blocked: device?.is_blocked === 1,
    blockedReason: device?.blocked_reason || '',
    msgLimit: device?.msg_limit || 150,
    msgCountToday: device?.msg_date === today ? device?.msg_count_today : 0,
    notifications: (notifs || []).map(n => ({
      id: n.id, type: n.type, title: n.title, body: n.body,
      version: n.version, updateUrl: n.update_url, sizeMB: n.size_mb,
      ts: n.created_at
    })),
    serverVersion: '1.0.0'
  });
});

router.post('/track', async (req, res) => {
  const db = getDB();
  const { deviceId } = req.body;
  if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

  const today = new Date().toISOString().slice(0, 10);
  const { data: devArr } = await db.from('devices').select('*').eq('id', deviceId).limit(1);
  const d = devArr?.[0];
  if (!d) return res.status(404).json({ error: 'Device not found' });
  if (d.is_blocked) return res.json({ ok: false, blocked: true });

  const newCount = d.msg_date === today ? d.msg_count_today + 1 : 1;
  await db.from('devices').update({
    msg_count_today: newCount,
    msg_date: today,
    total_messages: (d.total_messages || 0) + 1
  }).eq('id', deviceId);

  res.json({ ok: true, count: newCount, limit: d.msg_limit, remaining: d.msg_limit - newCount });
});

router.post('/error', async (req, res) => {
  const db = getDB();
  const { deviceId, errorType, message, stack } = req.body;
  await db.from('errors').insert({
    device_id: deviceId || 'unknown',
    error_type: errorType || 'unknown',
    message: message || '',
    stack: stack || '',
    ts: Date.now()
  });
  res.json({ ok: true });
});

module.exports = router;
