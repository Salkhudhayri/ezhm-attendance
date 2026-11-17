// Force-closes any shift that is still open after its Riyadh calendar day has ended,
// flagging it auto_clock_out=true so the admin knows to review/correct it.
//
// Called opportunistically at the top of attendance requests (so correctness never
// depends on a cron actually firing), and also wired up as a Vercel Cron target
// (see api/cron/auto-clock-out.js) for a daily sweep just after Riyadh midnight.
const { all, run } = require('../db/db');
const { toRiyadhDateKey, getRiyadhDayRange } = require('./time');

async function runAutoClockOutSweep() {
  const openEntries = await all('SELECT * FROM time_entries WHERE clock_out IS NULL');
  const todayKey = toRiyadhDateKey(Date.now());

  let closedCount = 0;
  for (const entry of openEntries) {
    const startKey = toRiyadhDateKey(entry.clock_in);
    if (startKey === todayKey) continue; // still within the same Riyadh day, leave it open

    const { dayEndMs } = getRiyadhDayRange(entry.clock_in);
    const midnightIso = new Date(dayEndMs).toISOString();

    await run('UPDATE breaks SET break_end = $1 WHERE time_entry_id = $2 AND break_end IS NULL', [
      midnightIso,
      entry.id,
    ]);
    await run('UPDATE time_entries SET clock_out = $1, auto_clock_out = TRUE WHERE id = $2', [
      midnightIso,
      entry.id,
    ]);
    closedCount += 1;
  }
  return closedCount;
}

module.exports = { runAutoClockOutSweep };
