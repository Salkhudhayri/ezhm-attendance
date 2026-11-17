const express = require('express');
const { all, one, run } = require('../db/db');
const { requireAdmin } = require('../middleware/auth');
const { verifySecret, isValidPin } = require('../utils/auth');
const { formatTime12h, formatDateTime12h } = require('../utils/time');
const { runAutoClockOutSweep } = require('../utils/autoClockOut');
const { distanceMeters } = require('../utils/geo');

const router = express.Router();

// Opportunistic sweep so a shift left open overnight is corrected before it can
// confuse "am I clocked in?" checks — doesn't depend on the Vercel Cron actually firing.
router.use(async (req, res, next) => {
  try {
    await runAutoClockOutSweep();
    next();
  } catch (err) {
    next(err);
  }
});

function getEmployeeById(id) {
  return one('SELECT * FROM employees WHERE id = $1', [id]);
}

function getOpenEntry(employeeId) {
  return one('SELECT * FROM time_entries WHERE employee_id = $1 AND clock_out IS NULL', [employeeId]);
}

function getOpenBreak(timeEntryId) {
  return one('SELECT * FROM breaks WHERE time_entry_id = $1 AND break_end IS NULL', [timeEntryId]);
}

async function withBreaks(entry) {
  if (!entry) return entry;
  const breaks = await all('SELECT * FROM breaks WHERE time_entry_id = $1 ORDER BY id', [entry.id]);
  return { ...entry, breaks };
}

// Verifies employee_id + pin from the request body. Returns { employee } or { error, status }.
async function authenticate(body) {
  const employeeId = Number(body.employee_id);
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';

  if (!Number.isInteger(employeeId)) return { status: 400, error: 'Please select an employee.' };
  if (!isValidPin(pin)) return { status: 400, error: 'PIN must be exactly 4 digits.' };

  const employee = await getEmployeeById(employeeId);
  if (!employee || !employee.is_active) {
    return { status: 404, error: 'Employee not found.' };
  }
  if (!verifySecret(pin, employee.pin_hash)) {
    return { status: 401, error: 'Incorrect PIN.' };
  }
  return { employee };
}

// GET /api/attendance/status/:employeeId — public: is this employee clocked in / on break?
// (Visible on a shop-floor kiosk anyway; no PIN required just to read status.)
router.get('/status/:employeeId', async (req, res, next) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const employee = await getEmployeeById(employeeId);
    if (!employee || !employee.is_active) return res.status(404).json({ error: 'Employee not found.' });

    const openEntry = await getOpenEntry(employeeId);
    if (!openEntry) return res.json({ status: 'clocked_out' });

    const openBreak = await getOpenBreak(openEntry.id);
    res.json({
      status: openBreak ? 'on_break' : 'clocked_in',
      clockInTime: formatTime12h(openEntry.clock_in),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/clock-in { employee_id, pin }
router.post('/clock-in', async (req, res, next) => {
  try {
    const auth = await authenticate(req.body || {});
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { employee } = auth;

    if (await getOpenEntry(employee.id)) {
      return res.status(409).json({ error: `${employee.name_en} is already clocked in.` });
    }

    const nowIso = new Date().toISOString();
    const created = await one('INSERT INTO time_entries (employee_id, clock_in) VALUES ($1, $2) RETURNING id', [
      employee.id,
      nowIso,
    ]);

    res.status(201).json({
      message: `${employee.name_en} clocked in successfully.`,
      employee: { id: employee.id, name_en: employee.name_en, name_ar: employee.name_ar },
      time: formatDateTime12h(nowIso),
      entryId: created.id,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/clock-out { employee_id, pin }
router.post('/clock-out', async (req, res, next) => {
  try {
    const auth = await authenticate(req.body || {});
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { employee } = auth;

    const openEntry = await getOpenEntry(employee.id);
    if (!openEntry) {
      return res.status(409).json({ error: `${employee.name_en} is not currently clocked in.` });
    }

    const nowIso = new Date().toISOString();

    // Auto-close a dangling open break so a forgotten "end break" never blocks clock-out.
    const openBreak = await getOpenBreak(openEntry.id);
    if (openBreak) {
      await run('UPDATE breaks SET break_end = $1 WHERE id = $2', [nowIso, openBreak.id]);
    }

    await run('UPDATE time_entries SET clock_out = $1 WHERE id = $2', [nowIso, openEntry.id]);

    res.json({
      message: `${employee.name_en} clocked out successfully.`,
      employee: { id: employee.id, name_en: employee.name_en, name_ar: employee.name_ar },
      time: formatDateTime12h(nowIso),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/break-start { employee_id, pin }
router.post('/break-start', async (req, res, next) => {
  try {
    const auth = await authenticate(req.body || {});
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { employee } = auth;

    const openEntry = await getOpenEntry(employee.id);
    if (!openEntry) {
      return res.status(409).json({ error: `${employee.name_en} must be clocked in to start a break.` });
    }
    if (await getOpenBreak(openEntry.id)) {
      return res.status(409).json({ error: `${employee.name_en} is already on a break.` });
    }

    const nowIso = new Date().toISOString();
    await run('INSERT INTO breaks (time_entry_id, break_start) VALUES ($1, $2)', [openEntry.id, nowIso]);

    res.status(201).json({
      message: `${employee.name_en} started a break.`,
      time: formatDateTime12h(nowIso),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/break-end { employee_id, pin }
router.post('/break-end', async (req, res, next) => {
  try {
    const auth = await authenticate(req.body || {});
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { employee } = auth;

    const openEntry = await getOpenEntry(employee.id);
    if (!openEntry) {
      return res.status(409).json({ error: `${employee.name_en} is not currently clocked in.` });
    }
    const openBreak = await getOpenBreak(openEntry.id);
    if (!openBreak) {
      return res.status(409).json({ error: `${employee.name_en} is not currently on a break.` });
    }

    const nowIso = new Date().toISOString();
    await run('UPDATE breaks SET break_end = $1 WHERE id = $2', [nowIso, openBreak.id]);

    res.json({
      message: `${employee.name_en} ended their break.`,
      time: formatDateTime12h(nowIso),
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/attendance/location-check { employee_id, pin, lat, lng }
// Called periodically by an employee's own device (see the /track page) while they're
// clocked in. Never clocks anyone out — only flags the open shift (left_zone_at) the
// first time it's found outside the configured zone, for the admin to review.
router.post('/location-check', async (req, res, next) => {
  try {
    const auth = await authenticate(req.body || {});
    if (auth.error) return res.status(auth.status).json({ error: auth.error });
    const { employee } = auth;

    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: 'A valid lat/lng is required.' });
    }

    const openEntry = await getOpenEntry(employee.id);
    if (!openEntry) {
      return res.status(409).json({ error: `${employee.name_en} is not currently clocked in.` });
    }

    // Each employee is measured against their own branch's zone, so staff at
    // one location are never flagged for being away from the other.
    if (!employee.branch_id) {
      return res
        .status(409)
        .json({ error: `${employee.name_en} is not assigned to a branch yet. Ask your admin to set one.` });
    }
    const zone = await one('SELECT * FROM branches WHERE id = $1', [employee.branch_id]);
    if (!zone || zone.zone_lat === null || zone.zone_lng === null || zone.zone_radius_m === null) {
      return res
        .status(409)
        .json({ error: 'This branch has no location set yet. Ask your admin to set it up.' });
    }

    const distance = distanceMeters(lat, lng, Number(zone.zone_lat), Number(zone.zone_lng));
    const withinZone = distance <= Number(zone.zone_radius_m);

    let flaggedNow = false;
    if (!withinZone && !openEntry.left_zone_at) {
      await run('UPDATE time_entries SET left_zone_at = now() WHERE id = $1', [openEntry.id]);
      flaggedNow = true;
    }

    res.json({
      withinZone,
      distanceMeters: Math.round(distance),
      flaggedNow,
      branch: { id: zone.id, name_en: zone.name_en, name_ar: zone.name_ar },
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Admin: records browsing + manual corrections
// ---------------------------------------------------------------------------

// GET /api/attendance/records?employee_id=&branch_id=&start=&end=  (start/end are YYYY-MM-DD, inclusive)
router.get('/records', requireAdmin, async (req, res, next) => {
  try {
    const { employee_id, branch_id, start, end } = req.query;
    const clauses = [];
    const params = [];

    if (employee_id) {
      params.push(Number(employee_id));
      clauses.push(`te.employee_id = $${params.length}`);
    }
    if (branch_id) {
      params.push(Number(branch_id));
      clauses.push(`e.branch_id = $${params.length}`);
    }
    if (start) {
      params.push(`${start}T00:00:00.000Z`);
      clauses.push(`te.clock_in >= $${params.length}`);
    }
    if (end) {
      params.push(`${end}T23:59:59.999Z`);
      clauses.push(`te.clock_in <= $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = await all(
      `SELECT te.*, e.name_en, e.name_ar, e.branch_id, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
       FROM time_entries te
       JOIN employees e ON e.id = te.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       ${where}
       ORDER BY te.clock_in DESC`,
      params
    );

    res.json(await Promise.all(rows.map(withBreaks)));
  } catch (err) {
    next(err);
  }
});

async function validateManualPayload(body) {
  const errors = [];
  const employeeId = Number(body.employee_id);
  const clockIn = body.clock_in ? new Date(body.clock_in) : null;
  const clockOut = body.clock_out ? new Date(body.clock_out) : null;
  const note = typeof body.note === 'string' ? body.note.trim() : '';

  if (!Number.isInteger(employeeId) || !(await getEmployeeById(employeeId))) errors.push('Valid employee is required.');
  if (!clockIn || Number.isNaN(clockIn.getTime())) errors.push('A valid clock-in time is required.');
  if (body.clock_out && (!clockOut || Number.isNaN(clockOut.getTime()))) errors.push('Clock-out time is invalid.');
  if (clockIn && clockOut && clockOut < clockIn) errors.push('Clock-out time cannot be before clock-in time.');
  if (!note) errors.push('A note explaining this manual entry is required.');

  return { errors, employeeId, clockIn, clockOut, note };
}

// POST /api/attendance/manual — admin creates a new (backfilled) entry
router.post('/manual', requireAdmin, async (req, res, next) => {
  try {
    const { errors, employeeId, clockIn, clockOut, note } = await validateManualPayload(req.body || {});
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const created = await one(
      `INSERT INTO time_entries (employee_id, clock_in, clock_out, is_edited, edit_note, edited_by, edited_at)
       VALUES ($1, $2, $3, TRUE, $4, $5, now())
       RETURNING *`,
      [employeeId, clockIn.toISOString(), clockOut ? clockOut.toISOString() : null, note, req.admin.username]
    );

    res.status(201).json(await withBreaks(created));
  } catch (err) {
    next(err);
  }
});

// PUT /api/attendance/:id — admin corrects an existing entry
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await one('SELECT * FROM time_entries WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Time entry not found.' });

    const { errors, clockIn, clockOut, note } = await validateManualPayload({
      ...req.body,
      employee_id: existing.employee_id,
    });
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const updated = await one(
      `UPDATE time_entries
       SET clock_in = $1, clock_out = $2, is_edited = TRUE, edit_note = $3, edited_by = $4, edited_at = now()
       WHERE id = $5
       RETURNING *`,
      [clockIn.toISOString(), clockOut ? clockOut.toISOString() : null, note, req.admin.username, id]
    );

    res.json(await withBreaks(updated));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/attendance/:id — admin removes an erroneous entry
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await one('SELECT * FROM time_entries WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Time entry not found.' });

    await run('DELETE FROM time_entries WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
