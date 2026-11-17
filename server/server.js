// Local development entry point: node server.js (or `npm run dev`).
// On Vercel, api/index.js imports server/app.js directly instead — this file never runs there.
require('dotenv').config();

const app = require('./app');
const { runAutoClockOutSweep } = require('./utils/autoClockOut');

const PORT = process.env.PORT || 4000;

// Local dev convenience: also sweep on an interval, on top of the per-request sweep
// in server/routes/attendance.js, so a server left running overnight self-corrects.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
runAutoClockOutSweep().catch((err) => console.error('Startup auto clock-out sweep failed:', err));
setInterval(() => {
  runAutoClockOutSweep().catch((err) => console.error('Auto clock-out sweep failed:', err));
}, SWEEP_INTERVAL_MS);

app.listen(PORT, () => {
  console.log(`Time & Attendance server running on http://localhost:${PORT}`);
});
