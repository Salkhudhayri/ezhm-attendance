// Vercel Cron target (see vercel.json) — runs daily at 21:00 UTC (00:00 Asia/Riyadh)
// and force-closes any shift still open from the day before.
//
// This is a belt-and-suspenders sweep: server/routes/attendance.js already runs the
// same sweep opportunistically on every attendance request, so correctness never
// actually depends on this cron firing on time.
require('dotenv').config();

const { runAutoClockOutSweep } = require('../../server/utils/autoClockOut');

module.exports = async (req, res) => {
  // If CRON_SECRET is set, only accept requests carrying it (Vercel sends this
  // automatically as "Authorization: Bearer <CRON_SECRET>" for its own cron calls).
  if (process.env.CRON_SECRET) {
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (req.headers.authorization !== expected) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  try {
    const closedCount = await runAutoClockOutSweep();
    res.status(200).json({ ok: true, closedCount });
  } catch (err) {
    console.error('Cron auto clock-out sweep failed:', err);
    res.status(500).json({ error: 'Sweep failed' });
  }
};
