require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDB } = require('./db/database');
const clientRoutes = require('./routes/client');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10kb' }));

// Rate limiting
const limiter = rateLimit({ windowMs: 60*1000, max: 60, message: { error: 'Too many requests' } });
app.use('/api/client', limiter);
app.use('/api/admin', rateLimit({ windowMs: 60*1000, max: 200 }));

// Init DB
initDB();

// Routes
app.use('/api/client', clientRoutes);    // Client apps poll this
app.use('/api/admin', adminRoutes);      // Admin dashboard uses this

app.get('/', (_, res) => res.json({ name: 'Sandbot Server', version: '1.0.0', status: 'running' }));

// Health check
app.get('/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

app.listen(PORT, () => {
  console.log(`✦ Sandbot Server running on http://localhost:${PORT}`);
  console.log(`  Admin API: http://localhost:${PORT}/api/admin`);
  console.log(`  Client API: http://localhost:${PORT}/api/client`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please kill the process using it or use a different port.`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
