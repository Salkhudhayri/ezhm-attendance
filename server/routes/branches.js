// Branch (shop location) management. Each branch optionally carries a geofence
// zone; employees belong to a branch and are checked against their own branch's
// zone. Reading the branch list is public so the kiosk and the employee tracking
// page can offer a location picker before anyone has logged in — only names and
// zone-configured status are exposed there, never coordinates.
const express = require('express');
const { all, one, run } = require('../db/db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function serializePublic(branch) {
  return {
    id: branch.id,
    name_en: branch.name_en,
    name_ar: branch.name_ar,
  };
}

function serializeAdmin(branch) {
  const configured = branch.zone_lat !== null && branch.zone_lng !== null && branch.zone_radius_m !== null;
  return {
    id: branch.id,
    name_en: branch.name_en,
    name_ar: branch.name_ar,
    is_active: branch.is_active,
    zoneConfigured: configured,
    lat: configured ? Number(branch.zone_lat) : null,
    lng: configured ? Number(branch.zone_lng) : null,
    radiusM: configured ? Number(branch.zone_radius_m) : null,
    employeeCount: Number(branch.employee_count || 0),
  };
}

// Public: the kiosk / tracking page branch picker.
router.get('/', async (req, res, next) => {
  try {
    const branches = await all('SELECT * FROM branches WHERE is_active = TRUE ORDER BY id');
    res.json(branches.map(serializePublic));
  } catch (err) {
    next(err);
  }
});

router.get('/all', requireAdmin, async (req, res, next) => {
  try {
    const branches = await all(
      `SELECT b.*, (SELECT count(*) FROM employees e WHERE e.branch_id = b.id AND e.is_active = TRUE) AS employee_count
       FROM branches b
       ORDER BY b.is_active DESC, b.id`
    );
    res.json(branches.map(serializeAdmin));
  } catch (err) {
    next(err);
  }
});

// A branch may be saved with no zone at all (location not set up yet), but if
// any of the three zone fields is given, all three must be valid together.
function validateBranchPayload(body) {
  const errors = [];
  const name_en = typeof body.name_en === 'string' ? body.name_en.trim() : '';
  const name_ar = typeof body.name_ar === 'string' ? body.name_ar.trim() : '';
  if (!name_en) errors.push('Branch name (English) is required.');

  const rawZone = [body.lat, body.lng, body.radiusM];
  const provided = rawZone.filter((v) => v !== undefined && v !== null && v !== '');
  let lat = null;
  let lng = null;
  let radiusM = null;

  if (provided.length > 0) {
    if (provided.length < 3) {
      errors.push('Latitude, longitude and radius must all be provided together.');
    } else {
      lat = Number(body.lat);
      lng = Number(body.lng);
      radiusM = Number(body.radiusM);
      if (!Number.isFinite(lat) || lat < -90 || lat > 90) errors.push('Latitude must be between -90 and 90.');
      if (!Number.isFinite(lng) || lng < -180 || lng > 180) errors.push('Longitude must be between -180 and 180.');
      if (!Number.isFinite(radiusM) || radiusM <= 0) errors.push('Radius must be a positive number of meters.');
    }
  }

  return { errors, value: { name_en, name_ar, lat, lng, radiusM } };
}

router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { errors, value } = validateBranchPayload(req.body || {});
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const created = await one(
      `INSERT INTO branches (name_en, name_ar, zone_lat, zone_lng, zone_radius_m, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE) RETURNING *`,
      [value.name_en, value.name_ar || null, value.lat, value.lng, value.radiusM]
    );
    res.status(201).json(serializeAdmin(created));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await one('SELECT * FROM branches WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Branch not found.' });

    const { errors, value } = validateBranchPayload(req.body || {});
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const is_active = req.body.is_active === undefined ? existing.is_active : !!req.body.is_active;
    const updated = await one(
      `UPDATE branches
       SET name_en = $1, name_ar = $2, zone_lat = $3, zone_lng = $4, zone_radius_m = $5, is_active = $6, updated_at = now()
       WHERE id = $7 RETURNING *`,
      [value.name_en, value.name_ar || null, value.lat, value.lng, value.radiusM, is_active, id]
    );
    res.json(serializeAdmin(updated));
  } catch (err) {
    next(err);
  }
});

// Deleting a branch would orphan its staff (ON DELETE SET NULL would hide them
// from every kiosk), so refuse while anyone is still assigned to it.
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await one('SELECT * FROM branches WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Branch not found.' });

    const assigned = await one('SELECT count(*)::int AS count FROM employees WHERE branch_id = $1', [id]);
    if (assigned.count > 0) {
      return res.status(409).json({
        error: `This branch still has ${assigned.count} employee(s) assigned. Move them to another branch first.`,
      });
    }

    await run('DELETE FROM branches WHERE id = $1', [id]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
