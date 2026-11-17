// Thin async wrapper around node-postgres, kept close to the shape of the old
// better-sqlite3 helpers (all/one/run) so the route rewrite stayed mechanical.
// Works against any Postgres, including the pooled connection string Vercel's
// Postgres (Neon) storage integration provides.
const { Pool } = require('pg');

// The auto-provisioned Neon integration on this project named its variables with an
// unexpected "JWT_SECRET_" prefix instead of the plain names — falling back to those
// too rather than fighting the naming, since the values themselves are marked
// "Sensitive" in Vercel and can't be read back out to rename them.
const connectionString =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.JWT_SECRET_DATABASE_URL ||
  process.env.JWT_SECRET_POSTGRES_URL;
if (!connectionString) {
  throw new Error(
    'Missing DATABASE_URL (or POSTGRES_URL) environment variable — see server/.env.example.'
  );
}

const pool = new Pool({
  connectionString,
  ssl: /localhost|127\.0\.0\.1/.test(connectionString) ? false : { rejectUnauthorized: false },
});

// Required by node-postgres: without this, an idle client losing its connection
// (network blip, DB restart, Neon scale-to-zero) throws an unhandled 'error' event
// on the pool and crashes the whole process.
pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error on an idle client:', err);
});

async function all(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows;
}

async function one(text, params = []) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

async function run(text, params = []) {
  return pool.query(text, params);
}

module.exports = { all, one, run, raw: pool };
