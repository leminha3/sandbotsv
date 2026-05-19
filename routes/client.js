// routes/client.js - Supabase client API
const router = require('express').Router();
const { getDB } = require('../db/database');

const DEFAULT_MSG_LIMIT = Number.parseInt(process.env.DEFAULT_MSG_LIMIT || '100', 10);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function asNonNegativeInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function normalizePlatform(platform, osVersion) {
  const raw = String(platform || '').trim();
  const version = String(osVersion || '').trim();
  if (/win32|windows/i.test(raw)) return version ? `Windows ${version}` : 'Windows';
  if (/darwin|mac/i.test(raw)) return version ? `macOS ${version}` : 'macOS';
  if (/linux/i.test(raw)) return version ? `Linux ${version}` : 'Linux';
  return raw || 'Windows';
}

function pickUsageCount(body) {
  return asNonNegativeInt(
    body.msgCountToday ??
    body.messageCountToday ??
    body.requestsToday ??
    body.requestCountToday ??
    body.usedToday ??
    body.count
  );
}

async function getDevice(db, deviceId) {
  const { data, error } = await db.from('devices').select('*').eq('id', deviceId).limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

router.post('/heartbeat', async (req, res) => {
  try {
    const db = getDB();
    const { deviceId, version, platform, osVersion, totalMessages } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

    const now = Date.now();
    const today = todayKey();
    const reportedToday = pickUsageCount(req.body);
    const reportedTotal = asNonNegativeInt(totalMessages);
    const normalizedPlatform = normalizePlatform(platform, osVersion);
    const existing = await getDevice(db, deviceId);

    if (!existing) {
      const { error } = await db.from('devices').insert({
        id: deviceId,
        first_seen: now,
        last_seen: now,
        version: version || '1.1.1',
        platform: normalizedPlatform,
        msg_limit: DEFAULT_MSG_LIMIT,
        msg_count_today: reportedToday ?? 0,
        msg_date: reportedToday !== null ? today : '',
        total_messages: Math.max(reportedTotal ?? 0, reportedToday ?? 0)
      });
      if (error) throw error;
    } else {
      const update = {
        last_seen: now,
        version: version || existing.version,
        platform: normalizedPlatform || existing.platform
      };

      if (reportedToday !== null) {
        update.msg_count_today = existing.msg_date === today
          ? Math.max(existing.msg_count_today || 0, reportedToday)
          : reportedToday;
        update.msg_date = today;
        update.total_messages = Math.max(existing.total_messages || 0, reportedTotal ?? 0, update.msg_count_today);
      } else if (reportedTotal !== null) {
        update.total_messages = Math.max(existing.total_messages || 0, reportedTotal);
      }

      const { error } = await db.from('devices').update(update).eq('id', deviceId);
      if (error) throw error;
    }

    const device = await getDevice(db, deviceId);
    const { data: notifs, error: notifError } = await db.from('notifications')
      .select('*')
      .in('target', ['all', deviceId])
      .or(`expires_at.eq.0,expires_at.gt.${now}`)
      .order('created_at', { ascending: false })
      .limit(20);
    if (notifError) throw notifError;

    const msgLimit = device?.msg_limit ?? DEFAULT_MSG_LIMIT;
    const msgCountToday = device?.msg_date === today ? (device?.msg_count_today || 0) : 0;

    res.json({
      ok: true,
      blocked: device?.is_blocked === 1,
      blockedReason: device?.blocked_reason || '',
      msgLimit,
      limit: msgLimit,
      msgCountToday,
      requestsToday: msgCountToday,
      remaining: Math.max(msgLimit - msgCountToday, 0),
      totalMessages: device?.total_messages || 0,
      notifications: (notifs || []).map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        message: n.body,
        version: n.version,
        updateUrl: n.update_url,
        sizeMB: n.size_mb,
        ts: n.created_at
      })),
      serverVersion: '1.0.0'
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Heartbeat failed' });
  }
});

async function trackUsage(req, res) {
  try {
    const db = getDB();
    const { deviceId, increment } = req.body;
    if (!deviceId) return res.status(400).json({ error: 'Missing deviceId' });

    const today = todayKey();
    const device = await getDevice(db, deviceId);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    if (device.is_blocked) {
      return res.json({
        ok: false,
        blocked: true,
        blockedReason: device.blocked_reason || ''
      });
    }

    const by = Math.max(asNonNegativeInt(increment) ?? 1, 1);
    const limit = device.msg_limit ?? DEFAULT_MSG_LIMIT;
    const currentCount = device.msg_date === today ? (device.msg_count_today || 0) : 0;
    if (currentCount >= limit) {
      return res.json({
        ok: false,
        limitReached: true,
        count: currentCount,
        msgCountToday: currentCount,
        requestsToday: currentCount,
        limit,
        msgLimit: limit,
        remaining: 0
      });
    }

    const newCount = Math.min(currentCount + by, limit);
    const { error } = await db.from('devices').update({
      msg_count_today: newCount,
      msg_date: today,
      total_messages: (device.total_messages || 0) + by
    }).eq('id', deviceId);
    if (error) throw error;

    res.json({
      ok: true,
      count: newCount,
      msgCountToday: newCount,
      requestsToday: newCount,
      limit,
      msgLimit: limit,
      remaining: Math.max(limit - newCount, 0)
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Track failed' });
  }
}

router.post('/track', trackUsage);
router.post('/request', trackUsage);
router.post('/usage', trackUsage);
router.post('/message', trackUsage);

router.post('/error', async (req, res) => {
  try {
    const db = getDB();
    const { deviceId, errorType, message, stack } = req.body;
    const { error } = await db.from('errors').insert({
      device_id: deviceId || 'unknown',
      error_type: errorType || 'unknown',
      message: message || '',
      stack: stack || '',
      ts: Date.now()
    });
    if (error) throw error;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Error log failed' });
  }
});

module.exports = router;
