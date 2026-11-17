const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL = '12h';

function hashSecret(plain) {
  return bcrypt.hashSync(plain, 10);
}

function verifySecret(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function signAdminToken(admin) {
  return jwt.sign({ sub: admin.id, username: admin.username, role: 'admin' }, JWT_SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

const PIN_REGEX = /^\d{4}$/;

function isValidPin(pin) {
  return typeof pin === 'string' && PIN_REGEX.test(pin);
}

module.exports = {
  hashSecret,
  verifySecret,
  signAdminToken,
  verifyToken,
  isValidPin,
};
