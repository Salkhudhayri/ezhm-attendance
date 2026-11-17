const express = require('express');
const { one, run } = require('../db/db');
const { requireAdmin } = require('../middleware/auth');
const { verifySecret, hashSecret, signAdminToken } = require('../utils/auth');

const router = express.Router();

const MIN_PASSWORD_LENGTH = 8;

// POST /api/auth/login  { username, password }
router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const admin = await one('SELECT * FROM admins WHERE username = $1', [username.trim()]);

    if (!admin || !verifySecret(password, admin.password_hash)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = signAdminToken(admin);
    res.json({ token, username: admin.username });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password  { currentPassword, newPassword }
// Changes the password of the signed-in admin only — the account is taken from
// the JWT, never from the request body, so a session can't retarget another admin.
router.post('/change-password', requireAdmin, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are both required.' });
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters.` });
    }
    if (newPassword === currentPassword) {
      return res.status(400).json({ error: 'New password must be different from the current one.' });
    }

    const admin = await one('SELECT * FROM admins WHERE id = $1', [req.admin.sub]);
    if (!admin) return res.status(404).json({ error: 'Admin account not found.' });

    if (!verifySecret(currentPassword, admin.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect.' });
    }

    await run('UPDATE admins SET password_hash = $1 WHERE id = $2', [hashSecret(newPassword), admin.id]);

    // Hand back a fresh token so the open session stays valid after the change.
    res.json({ ok: true, token: signAdminToken(admin), username: admin.username });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
