// Applies schema.sql against DATABASE_URL. Safe to re-run (every statement is IF NOT EXISTS).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { raw } = require('./db');

// Moving from one shop to many branches: databases created before branches
// existed have employees with no branch_id (which would hide them from the
// kiosk) and possibly a zone in the old single-row shop_settings table. Fold
// both into a first "Main Branch" so an upgraded install keeps working as-is,
// then retire shop_settings. No-ops once branches exist.
async function migrateToBranches() {
  const { rows: branchRows } = await raw.query('SELECT count(*)::int AS count FROM branches', []);
  if (branchRows[0].count === 0) {
    const { rows: employeeRows } = await raw.query('SELECT count(*)::int AS count FROM employees', []);
    if (employeeRows[0].count > 0) {
      const { rows: oldZone } = await raw.query('SELECT * FROM shop_settings WHERE id = 1', []);
      const zone = oldZone[0] || {};
      await raw.query(
        `INSERT INTO branches (name_en, name_ar, zone_lat, zone_lng, zone_radius_m)
         VALUES ($1, $2, $3, $4, $5)`,
        ['Main Branch', 'الفرع الرئيسي', zone.zone_lat ?? null, zone.zone_lng ?? null, zone.zone_radius_m ?? null]
      );
    }
  }

  // Any employee without a branch lands in the oldest branch, so nobody
  // silently disappears from their kiosk after the upgrade.
  await raw.query(
    `UPDATE employees SET branch_id = (SELECT id FROM branches ORDER BY id LIMIT 1)
     WHERE branch_id IS NULL AND EXISTS (SELECT 1 FROM branches)`,
    []
  );

  await raw.query('DROP TABLE IF EXISTS shop_settings', []);
}

// Statements are split on ';', so '--' comments are stripped first — otherwise a
// semicolon inside a comment splits it in half and the tail becomes bad SQL.
// schema.sql has no string literals containing '--', so this stays safe.
function toStatements(schema) {
  return schema
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = toStatements(schema);

  for (const statement of statements) {
    await raw.query(statement, []);
  }

  await migrateToBranches();
}

if (require.main === module) {
  migrate()
    .then(() => {
      console.log('Schema migrated successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { migrate };
