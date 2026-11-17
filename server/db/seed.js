// Resets the database to a fresh install: the admin account and the starting branches.
// Run directly with: npm run seed (from server/) or npm run seed (from project root).
// Also exported as seedDatabase() so it can be triggered over HTTP via
// server/routes/setup.js when the DB connection string is only reachable
// from inside the deployed function (e.g. a "Sensitive" Vercel env var).
const { migrate } = require('./migrate');
const { run } = require('./db');
const { hashSecret } = require('../utils/auth');

// Ezhm starts with two placeholder branches (rename them from the admin
// Branches page) and no staff: the owner adds each employee, PIN and salary from
// Admin -> Employees. Zones are left NULL on purpose; set each branch's real
// location from the Branches page ("Use My Current Location", standing there).
const BRANCHES = [
  { key: 'b1', name_en: 'Branch 1', name_ar: 'الفرع 1' },
  { key: 'b2', name_en: 'Branch 2', name_ar: 'الفرع 2' },
];

const EMPLOYEES = [];

// Thrown when seeding would destroy real attendance history.
class SeedRefusedError extends Error {
  constructor(message) {
    super(message);
    this.status = 409;
  }
}

async function seedDatabase({ adminUsername, adminPassword, force = false }) {
  if (!adminPassword) throw new Error('ADMIN_PASSWORD must be set before seeding.');
  await migrate();

  // Seeding wipes everything. Once real clock-ins exist, refuse unless the
  // caller explicitly forces it, so a stray call can't erase payroll history.
  const { rows: existing } = await run('SELECT count(*)::int AS count FROM time_entries');
  if (existing[0].count > 0 && !force) {
    throw new SeedRefusedError(
      `Refusing to seed: ${existing[0].count} attendance records exist and would be deleted.`
    );
  }

  await run('DELETE FROM breaks');
  await run('DELETE FROM time_entries');
  await run('DELETE FROM employees');
  await run('DELETE FROM branches');
  await run('DELETE FROM admins');

  await run('INSERT INTO admins (username, password_hash) VALUES ($1, $2)', [
    adminUsername,
    hashSecret(adminPassword),
  ]);

  const branchIdByKey = {};
  for (const branch of BRANCHES) {
    const { rows } = await run(
      'INSERT INTO branches (name_en, name_ar, is_active) VALUES ($1, $2, TRUE) RETURNING id',
      [branch.name_en, branch.name_ar]
    );
    branchIdByKey[branch.key] = rows[0].id;
  }

  for (const emp of EMPLOYEES) {
    await run(
      `INSERT INTO employees (name_en, name_ar, pin_hash, monthly_salary, role, branch_id, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, TRUE)`,
      [emp.name_en, emp.name_ar, hashSecret(emp.pin), emp.monthly_salary, emp.role, branchIdByKey[emp.branch]]
    );
  }

  return { employeesSeeded: EMPLOYEES.length, branchesSeeded: BRANCHES.length, adminUsername };
}

if (require.main === module) {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

  seedDatabase({ adminUsername: ADMIN_USERNAME, adminPassword: ADMIN_PASSWORD })
    .then(() => {
      console.log(
        `Seeded ${BRANCHES.length} branches, ${EMPLOYEES.length} employees and admin user "${ADMIN_USERNAME}".`
      );
      console.log('Sample employee PINs (for testing the kiosk):');
      for (const emp of EMPLOYEES) {
        const branch = BRANCHES.find((b) => b.key === emp.branch);
        console.log(
          `  ${emp.name_en} (${emp.name_ar}) — PIN ${emp.pin} — ${emp.role} — ${emp.monthly_salary} SAR/month — ${branch.name_en}`
        );
      }
      console.log(`Admin login: username="${ADMIN_USERNAME}" password="${ADMIN_PASSWORD}"`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seeding failed:', err);
      process.exit(1);
    });
}

module.exports = { seedDatabase, EMPLOYEES, BRANCHES, SeedRefusedError };
