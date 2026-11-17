-- Time & Attendance System — Postgres schema (Vercel Postgres / Neon)
-- Timestamp columns are TIMESTAMPTZ, always written as UTC ISO-8601 from the app layer.
-- Conversion to Asia/Riyadh (UTC+3) and 12-hour formatting happens in the application layer,
-- never in the database, so the raw data stays timezone-agnostic and DST-proof.

-- ---------------------------------------------------------------------------
-- branches: physical shop locations. Each branch carries its own optional
-- geofence "zone" (centre point + radius) used to flag — never auto-clock-out —
-- shifts where an employee's own device reports being away from their branch.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS branches (
    id             SERIAL PRIMARY KEY,
    name_en        TEXT NOT NULL,
    name_ar        TEXT,                       -- optional Arabic display name
    zone_lat       NUMERIC(9, 6),              -- NULL until the owner sets the location
    zone_lng       NUMERIC(9, 6),
    zone_radius_m  NUMERIC(8, 1),
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- employees: shop staff who clock in/out at the kiosk
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
    id            SERIAL PRIMARY KEY,
    name_en       TEXT NOT NULL,
    name_ar       TEXT,                       -- optional Arabic display name
    pin_hash      TEXT NOT NULL,               -- bcrypt hash of the 4-digit PIN (never store raw)
    hourly_wage   NUMERIC(10, 2) DEFAULT 0,  -- retired: staff are on monthly salary now
    monthly_salary NUMERIC(10, 2) CHECK (monthly_salary >= 0),
    role          TEXT NOT NULL DEFAULT 'staff',
    branch_id     INTEGER REFERENCES branches(id) ON DELETE SET NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added after the original single-location release. Kept as a separate ALTER so
-- existing databases pick it up on re-migration.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS monthly_salary NUMERIC(10, 2);
ALTER TABLE employees ALTER COLUMN hourly_wage DROP NOT NULL;
ALTER TABLE employees ALTER COLUMN hourly_wage SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id);

-- PINs must be unique among currently-active employees (enforced in app code,
-- since Postgres can't easily do a partial-unique-index across a hashed column
-- — uniqueness is actually checked against plaintext PIN before hashing).

-- ---------------------------------------------------------------------------
-- admins: separate login for the management screens
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
    id            SERIAL PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- time_entries: one row per shift (clock-in -> clock-out).
-- A NULL clock_out means the employee is currently clocked in.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_entries (
    id              SERIAL PRIMARY KEY,
    employee_id     INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    clock_in        TIMESTAMPTZ NOT NULL,
    clock_out       TIMESTAMPTZ,               -- NULL while still clocked in
    auto_clock_out  BOOLEAN NOT NULL DEFAULT FALSE, -- set by the midnight sweep
    is_edited       BOOLEAN NOT NULL DEFAULT FALSE,
    edit_note       TEXT,                      -- admin's reason for a manual add/correction
    edited_by       TEXT,                      -- admin username who last edited this row
    edited_at       TIMESTAMPTZ,
    left_zone_at    TIMESTAMPTZ,               -- set once if the employee's own device reported being
                                                -- outside the shop zone during this shift (review-only, never auto-clocks-out)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CHECK (clock_out IS NULL OR clock_out >= clock_in)
);

ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS left_zone_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_time_entries_employee ON time_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_clock_in  ON time_entries(clock_in);
-- Fast "who is currently clocked in" lookups (partial index on open shifts)
CREATE INDEX IF NOT EXISTS idx_time_entries_open ON time_entries(employee_id) WHERE clock_out IS NULL;

-- ---------------------------------------------------------------------------
-- breaks: zero or more breaks nested inside a shift
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS breaks (
    id             SERIAL PRIMARY KEY,
    time_entry_id  INTEGER NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
    break_start    TIMESTAMPTZ NOT NULL,
    break_end      TIMESTAMPTZ,                -- NULL while on break

    CHECK (break_end IS NULL OR break_end >= break_start)
);

CREATE INDEX IF NOT EXISTS idx_breaks_time_entry ON breaks(time_entry_id);
CREATE INDEX IF NOT EXISTS idx_breaks_open ON breaks(time_entry_id) WHERE break_end IS NULL;

-- ---------------------------------------------------------------------------
-- shop_settings: superseded by branches (which holds a zone per location).
-- Kept as a CREATE here only so the data migration in migrate.js can read any
-- pre-existing single-location zone before dropping the table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS shop_settings (
    id             INTEGER PRIMARY KEY DEFAULT 1,
    zone_lat       NUMERIC(9, 6),
    zone_lng       NUMERIC(9, 6),
    zone_radius_m  NUMERIC(8, 1),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CHECK (id = 1)
);
