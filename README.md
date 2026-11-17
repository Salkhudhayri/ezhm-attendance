# Ezhm Shop — Time & Attendance

The Time & Attendance web app for **Ezhm Shop**, with **multiple branches**, deployed for free on Vercel. A tablet at each branch entrance runs a kiosk screen for clock in/out and breaks; a separate admin area handles branches, employee management, corrections, and payroll reports.

This is a fully separate deployment: its own GitHub repo, Vercel project and Postgres database. It shares no data or credentials with any other business.

## Live deployment

**App:** _(filled in after the first deploy)_
**Admin login:** `/admin/login` — credentials are the Vercel project's `ADMIN_USERNAME`/`ADMIN_PASSWORD` environment variables.

## Tech Stack

- **Frontend:** React (Vite) + Tailwind CSS — deployed as static output
- **Backend:** Node.js + Express, running as Vercel serverless functions
- **Database:** Postgres, auto-provisioned via Vercel's Neon Marketplace integration (free plan)
- **Scheduled job:** Vercel Cron for the daily midnight auto-clock-out sweep

## Folder Structure

```
time-attendance-system/
├── api/
│   ├── index.js                 Vercel serverless entry — wraps server/app.js
│   └── cron/auto-clock-out.js   Daily cron target (Vercel Cron)
├── server/
│   ├── app.js                   The Express app (routes, middleware) — no listen()
│   ├── server.js                Local dev entry point: node server.js
│   ├── db/                      schema.sql (Postgres), db.js (pg Pool), migrate.js, seed.js
│   ├── middleware/               admin JWT auth guard
│   ├── routes/                   auth, employees, attendance, reports, branches, setup
│   └── utils/                     time-zone/overtime math, auth helpers, CSV, geo, auto clock-out
├── client/                       React app
│   └── src/
│       ├── pages/                 Kiosk, Track, AdminLogin, AdminDashboard, Employees, Records, Reports, Branches, ChangePassword
│       ├── components/            PinPad, BranchPicker, AdminLayout, ProtectedRoute, LanguageToggle
│       ├── context/               LanguageContext (EN/AR + RTL), AuthContext (admin session)
│       ├── i18n/                   en.json, ar.json
│       └── utils/                   API client, Riyadh time-zone helpers
└── vercel.json                    Rewrites (Express routing) + cron schedule
```

## Database connection string

`server/db/db.js` reads `DATABASE_URL` (or `POSTGRES_URL`, or the `JWT_SECRET_`-prefixed names some Neon integrations create). Vercel may mark these **Sensitive**, so the value can only be read by the deployed function — which is why migration/seeding run over HTTP (below).

## One-time setup endpoint

`server/routes/setup.js` exposes `POST /api/setup/migrate` and `POST /api/setup/seed`, gated by an `X-Setup-Key` header that must match the `ADMIN_PASSWORD` env var. This exists because the DB connection string is Sensitive (see above) and can only be used from inside the running deployment — so migration/seeding has to be triggered over HTTP rather than run locally with a pulled `.env`. Example:

```bash
curl -X POST -H "X-Setup-Key: <your ADMIN_PASSWORD>" https://<your-deployment>.vercel.app/api/setup/seed
```

`/api/setup/seed` wipes everything and recreates the admin account plus two placeholder branches ("Branch 1", "Branch 2") with no staff. Once any attendance has been recorded it **refuses (HTTP 409)** unless you also send `X-Confirm-Wipe: yes`.

## Local Development

For local development you'd need your own Postgres connection string in `server/.env` (see `server/.env.example`) since the deployed database's connection string can't be extracted (see above — it's a Sensitive var). Point `DATABASE_URL` at any Postgres instance (a new Neon project, local Postgres, etc.), then:

```bash
npm install
npm run migrate
npm run seed
npm start
```

Then open **http://localhost:5173**.

## Starting data (as seeded)

- **Admin:** username/password are `ADMIN_USERNAME`/`ADMIN_PASSWORD` from the Vercel project.
- **Business name:** Ezhm Shop (Arabic: ازهم).
- **Branches:** "Branch 1" (الفرع 1) and "Branch 2" (الفرع 2), no location set. Rename them and set each location from Admin → Branches.
- **Employees:** none. Add each one (name, PIN, role, monthly salary, branch) from Admin → Employees.

## Pay rules

Staff are on a fixed monthly salary; everything derives from it:

```
daily wage    = monthly salary / 30        1500 / 30  = 50.00 /day
hourly rate   = daily wage / 10 hours        50 / 10  =  5.00 /hour
overtime rate = hourly x 1.5                  5 x 1.5 =  7.50 /hour = 0.125 /minute
```

- More than 10 worked hours (after breaks) in one Riyadh day is overtime, paid by the minute (a 10:57 shift = 57 min = 7.13 SAR).
- A monthly report starts at the full salary and deducts the daily wage for each scheduled Sun–Thu day that has **already passed** with no work. Today and future days never count as absences.
- The salary is the ceiling; only overtime can exceed it. An employee with no salary shows "Not set" and reports 0.

## Tests

`npm test -w server` runs the pay-maths integration tests against a real, disposable Postgres (`embedded-postgres`) — no database setup needed.
