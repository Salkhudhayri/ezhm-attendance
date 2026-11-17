const express = require('express');
const { all, one, run } = require('../db/db');
const { requireAdmin } = require('../middleware/auth');
const { hashSecret, verifySecret, isValidPin } = require('../utils/auth');

const router = express.Router();

function serializePublic(emp) {
  return { id: emp.id, name_en: emp.name_en, name_ar: emp.name_ar, role: emp.role, branch_id: emp.branch_id };
}

function serializeAdmin(emp) {
  return {
    id: emp.id,
    name_en: emp.name_en,
    name_ar: emp.name_ar,
    monthly_salary: emp.monthly_salary === null || emp.monthly_salary === undefined ? null : Number(emp.monthly_salary),
    role: emp.role,
    branch_id: emp.branch_id,
    branch_name_en: emp.branch_name_en || null,
    branch_name_ar: emp.branch_name_ar || null,
    is_active: emp.is_active,
    created_at: emp.created_at,
  };
}

// Re-reads an employee with their branch name joined in, so mutation responses
// carry the same shape as the list endpoint.
function getAdminEmployee(id) {
  return one(
    `SELECT e.*, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
     FROM employees e LEFT JOIN branches b ON b.id = e.branch_id
     WHERE e.id = $1`,
    [id]
  );
}

// GET /api/employees — public, kiosk-safe: active employees only, no wage/PIN.
// ?branch_id= narrows the list to one location's staff (used by the kiosk once
// a branch has been picked on that device).
router.get('/', async (req, res, next) => {
  try {
    const branchId = req.query.branch_id ? Number(req.query.branch_id) : null;
    const employees = branchId
      ? await all(
          'SELECT id, name_en, name_ar, role, branch_id FROM employees WHERE is_active = TRUE AND branch_id = $1 ORDER BY name_en',
          [branchId]
        )
      : await all(
          'SELECT id, name_en, name_ar, role, branch_id FROM employees WHERE is_active = TRUE ORDER BY name_en'
        );
    res.json(employees.map(serializePublic));
  } catch (err) {
    next(err);
  }
});

// GET /api/employees/all — admin: everyone, including inactive, with wage
router.get('/all', requireAdmin, async (req, res, next) => {
  try {
    const employees = await all(
      `SELECT e.*, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
       FROM employees e LEFT JOIN branches b ON b.id = e.branch_id
       ORDER BY e.is_active DESC, b.id NULLS FIRST, e.name_en`
    );
    res.json(employees.map(serializeAdmin));
  } catch (err) {
    next(err);
  }
});

function validateEmployeePayload(body, { requirePin }) {
  const errors = [];
  const name_en = typeof body.name_en === 'string' ? body.name_en.trim() : '';
  const name_ar = typeof body.name_ar === 'string' ? body.name_ar.trim() : '';
  const role = typeof body.role === 'string' && body.role.trim() ? body.role.trim() : 'Staff';
  const hasSalary = body.monthly_salary !== undefined && body.monthly_salary !== null && body.monthly_salary !== '';
  const monthly_salary = hasSalary ? Number(body.monthly_salary) : null;
  const pin = typeof body.pin === 'string' ? body.pin.trim() : '';
  const hasBranch = body.branch_id !== undefined && body.branch_id !== null && body.branch_id !== '';
  const branch_id = hasBranch ? Number(body.branch_id) : null;

  if (!name_en) errors.push('English name is required.');
  if (!hasSalary || !Number.isFinite(monthly_salary) || monthly_salary < 0) {
    errors.push('Monthly salary must be a non-negative number.');
  }
  if (requirePin || pin) {
    if (!isValidPin(pin)) errors.push('PIN must be exactly 4 digits.');
  }
  if (hasBranch && !Number.isInteger(branch_id)) errors.push('Branch is invalid.');

  return { errors, value: { name_en, name_ar, role, monthly_salary, pin, branch_id } };
}

// An employee with no branch would not show up on any kiosk, so a branch is
// required whenever at least one exists.
async function validateBranchAssignment(branchId) {
  const branchCount = await one('SELECT count(*)::int AS count FROM branches WHERE is_active = TRUE');
  if (branchCount.count === 0) return null;
  if (branchId === null) return 'Please assign this employee to a branch.';
  const branch = await one('SELECT id FROM branches WHERE id = $1 AND is_active = TRUE', [branchId]);
  if (!branch) return 'That branch does not exist.';
  return null;
}

// Since PINs are hashed, uniqueness among active employees is checked by
// comparing the plaintext PIN against each active employee's hash.
async function isPinTaken(pin, excludeEmployeeId) {
  const activeEmployees = excludeEmployeeId
    ? await all('SELECT pin_hash FROM employees WHERE is_active = TRUE AND id != $1', [excludeEmployeeId])
    : await all('SELECT pin_hash FROM employees WHERE is_active = TRUE');
  return activeEmployees.some((row) => verifySecret(pin, row.pin_hash));
}

// POST /api/employees — admin: create
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { errors, value } = validateEmployeePayload(req.body || {}, { requirePin: true });
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    if (await isPinTaken(value.pin)) {
      return res.status(400).json({ error: 'That PIN is already in use by another active employee.' });
    }

    const branchError = await validateBranchAssignment(value.branch_id);
    if (branchError) return res.status(400).json({ error: branchError });

    const created = await one(
      `INSERT INTO employees (name_en, name_ar, pin_hash, monthly_salary, role, branch_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)
       RETURNING id`,
      [value.name_en, value.name_ar || null, hashSecret(value.pin), value.monthly_salary, value.role, value.branch_id]
    );

    res.status(201).json(serializeAdmin(await getAdminEmployee(created.id)));
  } catch (err) {
    next(err);
  }
});

// PUT /api/employees/:id — admin: edit (name, wage, role, active flag, optional PIN change)
router.put('/:id', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const existing = await one('SELECT * FROM employees WHERE id = $1', [id]);
    if (!existing) return res.status(404).json({ error: 'Employee not found.' });

    const { errors, value } = validateEmployeePayload(req.body || {}, { requirePin: false });
    if (errors.length) return res.status(400).json({ error: errors.join(' ') });

    const is_active = req.body.is_active === undefined ? existing.is_active : !!req.body.is_active;

    if (value.pin) {
      if (await isPinTaken(value.pin, id)) {
        return res.status(400).json({ error: 'That PIN is already in use by another active employee.' });
      }
    }

    const branchError = await validateBranchAssignment(value.branch_id);
    if (branchError) return res.status(400).json({ error: branchError });

    if (value.pin) {
      await run(
        `UPDATE employees
         SET name_en = $1, name_ar = $2, monthly_salary = $3, role = $4, branch_id = $5, is_active = $6,
             pin_hash = $7, updated_at = now()
         WHERE id = $8`,
        [
          value.name_en,
          value.name_ar || null,
          value.monthly_salary,
          value.role,
          value.branch_id,
          is_active,
          hashSecret(value.pin),
          id,
        ]
      );
    } else {
      await run(
        `UPDATE employees
         SET name_en = $1, name_ar = $2, monthly_salary = $3, role = $4, branch_id = $5, is_active = $6, updated_at = now()
         WHERE id = $7`,
        [value.name_en, value.name_ar || null, value.monthly_salary, value.role, value.branch_id, is_active, id]
      );
    }

    res.json(serializeAdmin(await getAdminEmployee(id)));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/employees/:id/deactivate — admin: quick deactivate (keeps history intact)
router.patch('/:id/deactivate', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const updated = await one(
      'UPDATE employees SET is_active = FALSE, updated_at = now() WHERE id = $1 RETURNING *',
      [id]
    );
    if (!updated) return res.status(404).json({ error: 'Employee not found.' });
    res.json(serializeAdmin(updated));
  } catch (err) {
    next(err);
  }
});

// PATCH /api/employees/:id/activate — admin: reactivate
router.patch('/:id/activate', requireAdmin, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const updated = await one(
      'UPDATE employees SET is_active = TRUE, updated_at = now() WHERE id = $1 RETURNING *',
      [id]
    );
    if (!updated) return res.status(404).json({ error: 'Employee not found.' });
    res.json(serializeAdmin(updated));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
