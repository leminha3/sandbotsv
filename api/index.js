// api/index.js — Vercel serverless entry point
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10kb' }));

// Lazy-init DB (runs on first request, not at import time)
let dbReady = false;
app.use(async (req, res, next) => {
  if (!dbReady) {
    const { initDB } = require('../db/database');
    await initDB();
    dbReady = true;
  }
  next();
});

// Routes
app.use('/api/client', require('../routes/client'));
app.use('/api/admin', require('../routes/admin'));

app.get('/', (_, res) => res.json({ name: 'Sandbot Server', version: '1.0.0', status: 'running' }));
app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

// Vercel: export app, don't call app.listen()
module.exports = app;
