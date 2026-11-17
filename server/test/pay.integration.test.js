// Integration tests for the pay maths, run against a real, disposable Postgres
// (embedded-postgres), using the real schema migration and the real report code.
//
//   npm test -w server
//
// Every expected figure below is worked out by hand from the pay rules:
//   daily = salary / 30, hourly = daily / 10, overtime = hourly * 1.5, paid per minute.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');
const http = require('http');
const EmbeddedPostgres = require('embedded-postgres').default;

const PORT = 54329;
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ta-pg-'));
// Under root, embedded-postgres runs initdb as a separate 'postgres' user, which
// must be able to enter the (otherwise 0700) temp dir and create its own data dir.
if (process.getuid && process.getuid() === 0) fs.chmodSync(tmpRoot, 0o777);
const dataDir = path.join(tmpRoot, 'data');
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: false,
  onLog: () => {},
});

let db, migrate, computeTimesheet, app, server, baseUrl;
const realNow = Date.now;

// A Riyadh wall-clock time ("2026-03-01T08:00") as a UTC Date.
const riyadh = (local) => new Date(`${local}:00+03:00`);
const setNow = (local) => {
  const ms = riyadh(local).getTime();
  Date.now = () => ms;
};

before(async () => {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase('ta_test');
  process.env.DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/ta_test`;
  process.env.ADMIN_PASSWORD = 'test-admin-pass';
  process.env.JWT_SECRET = 'test-jwt-secret';
  db = require('../db/db');
  ({ migrate } = require('../db/migrate'));
  ({ computeTimesheet } = require('../utils/timesheet'));
  await migrate();
  await migrate(); // re-running the migration must be harmless
  app = require('../app');
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, r));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  Date.now = realNow;
  if (server) await new Promise((r) => server.close(r));
  if (db) await db.raw.end();
  await pg.stop();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

let pinCounter = 1000;
async function makeEmployee(salary) {
  const { rows } = await db.run(
    `INSERT INTO employees (name_en, pin_hash, monthly_salary, role)
     VALUES ($1, $2, $3, 'staff') RETURNING *`,
    [`Emp ${pinCounter}`, `hash-${pinCounter++}`, salary]
  );
  return rows[0];
}

async function shift(emp, inLocal, outLocal, breaks = []) {
  const { rows } = await db.run(
    'INSERT INTO time_entries (employee_id, clock_in, clock_out) VALUES ($1, $2, $3) RETURNING id',
    [emp.id, riyadh(inLocal), outLocal ? riyadh(outLocal) : null]
  );
  for (const [s, e] of breaks) {
    await db.run('INSERT INTO breaks (time_entry_id, break_start, break_end) VALUES ($1, $2, $3)', [
      rows[0].id,
      riyadh(s),
      riyadh(e),
    ]);
  }
}

// Every Sun-Thu date of a month, as "YYYY-MM-DD".
function scheduledDates(year, month) {
  const out = [];
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= days; d++) {
    const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (dow <= 4) out.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return out;
}

const monthRange = (y, m) => ({
  start: Date.UTC(y, m - 1, 1) - 3 * 3600e3,
  end: Date.UTC(y, m, 1) - 3 * 3600e3 - 1,
});

async function monthly(emp, y, m) {
  const { start, end } = monthRange(y, m);
  return (await computeTimesheet(emp, start, end, { period: 'monthly' })).totals;
}

test('rates derive from the salary: 1500 -> 50/day, 5/h, 7.50/h OT, 0.125/min', async () => {
  setNow('2026-04-15T12:00');
  const emp = await makeEmployee(1500);
  const t = await monthly(emp, 2026, 3);
  assert.equal(t.dailyWage, 50);
  assert.equal(t.hourlyRate, 5);
  assert.equal(t.overtimeRate, 7.5);
  assert.equal(t.overtimeRatePerMinute, 0.125);
});

test('working every scheduled day of a 28-day month pays exactly the salary', async () => {
  setNow('2026-03-05T12:00');
  const emp = await makeEmployee(1500);
  const dates = scheduledDates(2026, 2);
  assert.equal(dates.length, 20); // Feb 2026: 20 Sun-Thu days
  for (const d of dates) await shift(emp, `${d}T08:00`, `${d}T18:00`);
  const t = await monthly(emp, 2026, 2);
  assert.equal(t.absentDays, 0);
  assert.equal(t.overtimeMinutes, 0);
  assert.equal(t.totalPay, 1500);
});

test('working every scheduled day of a 31-day month pays exactly the salary', async () => {
  setNow('2026-04-05T12:00');
  const emp = await makeEmployee(1500);
  const dates = scheduledDates(2026, 3);
  assert.equal(dates.length, 23); // Mar 2026: 23 Sun-Thu days (ends Sun 29, Mon 30, Tue 31)
  for (const d of dates) await shift(emp, `${d}T08:00`, `${d}T18:00`);
  const t = await monthly(emp, 2026, 3);
  assert.equal(t.absentDays, 0);
  assert.equal(t.totalPay, 1500);
});

test('a 10:57 shift is 57 overtime minutes = 7.13 SAR, on top of the salary', async () => {
  setNow('2026-04-05T12:00');
  const emp = await makeEmployee(1500);
  const dates = scheduledDates(2026, 3);
  for (const d of dates) await shift(emp, `${d}T08:00`, `${d}T18:00`);
  // One day runs 08:00 -> 18:57
  await db.run(
    `UPDATE time_entries SET clock_out = $1 WHERE employee_id = $2 AND clock_in = $3`,
    [riyadh('2026-03-10T18:57'), emp.id, riyadh('2026-03-10T08:00')]
  );
  const t = await monthly(emp, 2026, 3);
  assert.equal(t.overtimeMinutes, 57);
  assert.equal(t.overtimePay, 7.13);
  assert.equal(t.totalPay, 1507.13);
});

test('overtime is per minute, never rounded up to an hour (10:01 = 1 min = 0.13)', async () => {
  setNow('2026-04-05T12:00');
  const emp = await makeEmployee(1500);
  await shift(emp, '2026-03-02T08:00', '2026-03-02T18:01');
  const t = await monthly(emp, 2026, 3);
  assert.equal(t.overtimeMinutes, 1);
  assert.equal(t.overtimePay, 0.13); // 0.125 -> 0.13
});

test('two missed scheduled days deduct 2 x 50 = 100', async () => {
  setNow('2026-04-05T12:00');
  const emp = await makeEmployee(1500);
  const dates = scheduledDates(2026, 3).slice(2); // skip the first two
  for (const d of dates) await shift(emp, `${d}T08:00`, `${d}T18:00`);
  const t = await monthly(emp, 2026, 3);
  assert.equal(t.absentDays, 2);
  assert.equal(t.absenceDeduction, 100);
  assert.equal(t.totalPay, 1400);
});

test('weekends (Fri/Sat) are never absences; working one is just more hours', async () => {
  setNow('2026-04-05T12:00');
  const emp = await makeEmployee(1500);
  for (const d of scheduledDates(2026, 3)) await shift(emp, `${d}T08:00`, `${d}T18:00`);
  await shift(emp, '2026-03-06T08:00', '2026-03-06T12:00'); // a Friday, 4h
  const t = await monthly(emp, 2026, 3);
  assert.equal(t.absentDays, 0);
  assert.equal(t.totalPay, 1500); // under 10h that day, so no overtime and no extra
});

test('only days that have already passed count as absences (report opened mid-month)', async () => {
  // Tue 10 Mar 2026, 08:00: worked every scheduled day so far, not yet in today.
  setNow('2026-03-10T08:00');
  const emp = await makeEmployee(1500);
  for (const d of scheduledDates(2026, 3).filter((d) => d < '2026-03-10')) {
    await shift(emp, `${d}T08:00`, `${d}T18:00`);
  }
  const t = await monthly(emp, 2026, 3);
  assert.equal(t.absentDays, 0, 'today and future days must not be absences');
  assert.equal(t.periodInProgress, true);
  assert.equal(t.totalPay, 1500);
});

test('a report opened on the 1st, before anyone clocks in, keeps the full salary', async () => {
  setNow('2026-03-01T07:00');
  const emp = await makeEmployee(1500);
  const t = await monthly(emp, 2026, 3);
  assert.equal(t.absentDays, 0);
  assert.equal(t.totalPay, 1500);
});

test('the salary is the ceiling: absences can reduce pay to 0 but never below', async () => {
  setNow('2026-04-05T12:00');
  const emp = await makeEmployee(1500);
  const t = await monthly(emp, 2026, 3); // absent all 23 scheduled days
  assert.equal(t.absentDays, 23);
  assert.equal(t.totalPay, 350); // 1500 - 23 x 50
  assert.ok(t.totalPay <= 1500);
  // Absent every scheduled day across two short months still never goes negative.
  const e2 = await makeEmployee(600);
  const t2 = await monthly(e2, 2026, 3);
  assert.equal(t2.totalPay, 600 - 23 * 20); // 140
  assert.ok(t2.totalPay >= 0);
});

test('an employee with no salary reports 0 and is flagged, never guessed', async () => {
  setNow('2026-04-05T12:00');
  const emp = await makeEmployee(null);
  await shift(emp, '2026-03-02T08:00', '2026-03-02T20:00'); // 2h overtime
  const t = await monthly(emp, 2026, 3);
  assert.equal(t.salaryMissing, true);
  assert.equal(t.monthlySalary, 0);
  assert.equal(t.overtimePay, 0);
  assert.equal(t.totalPay, 0);
});

test('breaks are subtracted before overtime: 11h shift with a 1h break = 10h, no OT', async () => {
  setNow('2026-04-05T12:00');
  const emp = await makeEmployee(1500);
  await shift(emp, '2026-03-02T08:00', '2026-03-02T19:00', [['2026-03-02T13:00', '2026-03-02T14:00']]);
  const t = await monthly(emp, 2026, 3);
  assert.equal(t.workedHours, 10);
  assert.equal(t.overtimeMinutes, 0);
});

test('a shift crossing Riyadh midnight is split across the two days', async () => {
  setNow('2026-04-05T12:00');
  const emp = await makeEmployee(1500);
  await shift(emp, '2026-03-02T14:00', '2026-03-03T02:00'); // 10h Mon + 2h Tue
  const { start, end } = monthRange(2026, 3);
  const { days, totals } = await computeTimesheet(emp, start, end, { period: 'monthly' });
  assert.equal(days.find((d) => d.dateKey === '2026-03-02').workedHours, 10);
  assert.equal(days.find((d) => d.dateKey === '2026-03-03').workedHours, 2);
  assert.equal(totals.overtimeMinutes, 0);
});

// ---------------------------------------------------------------------------
// Over HTTP, through the real Express app: setup, login, kiosk, reports, CSV.
// ---------------------------------------------------------------------------
async function call(method, url, { body, token, headers = {} } = {}) {
  const res = await fetch(baseUrl + url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text };
}

test('HTTP: setup is password-gated, seed gives 2 branches + 0 staff, reports + CSV work', async () => {
  Date.now = realNow;
  // The seed refuses to run over existing attendance, so start this one clean.
  await db.run('TRUNCATE breaks, time_entries, employees, branches, admins RESTART IDENTITY CASCADE');
  assert.equal((await call('POST', '/api/setup/migrate')).status, 401);
  assert.equal(
    (await call('POST', '/api/setup/seed', { headers: { 'X-Setup-Key': 'wrong' } })).status,
    401
  );
  const seeded = await call('POST', '/api/setup/seed', { headers: { 'X-Setup-Key': 'test-admin-pass' } });
  assert.equal(seeded.status, 200, seeded.text);
  assert.equal(seeded.json.branchesSeeded, 2);
  assert.equal(seeded.json.employeesSeeded, 0);

  // Once real attendance exists, seeding again must refuse rather than wipe it.
  const login = await call('POST', '/api/auth/login', {
    body: { username: 'admin', password: 'test-admin-pass' },
  });
  assert.equal(login.status, 200, login.text);
  const token = login.json.token;

  const branches = await call('GET', '/api/branches', { token });
  assert.equal(branches.status, 200, branches.text);
  const branchList = Array.isArray(branches.json) ? branches.json : branches.json.branches;
  const branchId = branchList[0].id;

  const created = await call('POST', '/api/employees', {
    token,
    body: { name_en: 'Test One', pin: '4321', role: 'Cashier', monthly_salary: 1500, branch_id: branchId },
  });
  assert.equal(created.status, 201, created.text);
  const employeeId = created.json.id;

  const clockIn = await call('POST', '/api/attendance/clock-in', { body: { employee_id: employeeId, pin: '4321' } });
  assert.ok([200, 201].includes(clockIn.status), clockIn.text);

  const again = await call('POST', '/api/setup/seed', { headers: { 'X-Setup-Key': 'test-admin-pass' } });
  assert.equal(again.status, 409, 'seed must refuse to wipe real attendance');

  const clockOut = await call('POST', '/api/attendance/clock-out', { body: { employee_id: employeeId, pin: '4321' } });
  assert.ok([200, 201].includes(clockOut.status), clockOut.text);

  const report = await call('GET', '/api/reports/timesheet?period=monthly', { token });
  assert.equal(report.status, 200, report.text);
  const sheet = report.json.timesheets.find((s) => s.employee.name_en === 'Test One');
  assert.ok(sheet);
  assert.equal(sheet.totals.monthlySalary, 1500);

  const csv = await call('GET', '/api/reports/export?period=monthly', { token });
  assert.equal(csv.status, 200);
  assert.match(csv.text, /Total Pay \(SAR\)/);
  assert.match(csv.text, /Test One — TOTAL/);
});
