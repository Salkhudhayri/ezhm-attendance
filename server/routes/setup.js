// One-time setup endpoint: runs the schema migration + demo seed from *inside* the
// deployed function, where "Sensitive" env vars (like this project's DATABASE_URL)
// are legitimately readable at runtime even though they can't be pulled back out via
// the CLI/API. Gated by the admin password so it isn't publicly callable.
const express = require('express');
const { seedDatabase } = require('../db/seed');
const { migrate } = require('../db/migrate');

const router = express.Router();

function checkSetupKey(req, res) {
  const provided = req.headers['x-setup-key'];
  if (!provided || !process.env.ADMIN_PASSWORD || provided !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// POST /api/setup/migrate — create tables only, no data change
router.post('/migrate', async (req, res, next) => {
  if (!checkSetupKey(req, res)) return;
  try {
    await migrate();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/setup/seed — migrate + wipe + insert admin and starting branches.
// Refuses (409) once attendance exists, unless sent with "X-Confirm-Wipe: yes".
router.post('/seed', async (req, res, next) => {
  if (!checkSetupKey(req, res)) return;
  try {
    const adminUsername = process.env.ADMIN_USERNAME || 'admin';
    const adminPassword = process.env.ADMIN_PASSWORD;
    const force = req.headers['x-confirm-wipe'] === 'yes';
    const result = await seedDatabase({ adminUsername, adminPassword, force });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
