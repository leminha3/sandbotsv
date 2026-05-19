// api/index.js — Vercel serverless entry point
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

const app = express();

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// Lazy-init DB for API requests (runs on first API request, not at import time)
let dbReady = false;
app.use('/api', async (req, res, next) => {
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

app.get('/', (_, res) => res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html')));
app.get('/dashboard', (_, res) => res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html')));
app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

// Vercel: export app, don't call app.listen()
module.exports = app;
