// The actual Express app — no app.listen() here. Reused by:
//  - server/server.js  (local dev: node server.js, listens on PORT)
//  - api/index.js      (Vercel serverless entry, one function handles all /api/* routes)
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const reportRoutes = require('./routes/reports');
const setupRoutes = require('./routes/setup');
const branchRoutes = require('./routes/branches');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/setup', setupRoutes);
app.use('/api/branches', branchRoutes);

// Serve the built React app in production when it's been built alongside the server
// (local single-server deploys only — on Vercel the client is served as static output instead).
const clientDist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

// Centralized error handler — keeps malformed JSON bodies, DB errors, etc. from crashing the process
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Unexpected server error.' });
});

module.exports = app;
