// Timezone + payroll-math helpers. All stored timestamps are ISO-8601 UTC;
// everything "local" (day boundaries, week boundaries, 12h display) is derived
// here relative to Asia/Riyadh, which has no DST, so plain offset math is safe.

const TIME_ZONE = 'Asia/Riyadh';
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000; // UTC+3, fixed year-round
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
// A standard shift here is 10 hours; anything past that in the same day is overtime.
const STANDARD_DAILY_HOURS = 10;
const OVERTIME_THRESHOLD_MS = STANDARD_DAILY_HOURS * HOUR_MS;
const OVERTIME_MULTIPLIER = 1.5;
// Staff are on a fixed monthly salary covering the whole month, rest days
// included. Absence is deducted at the Saudi convention of salary / 30, which
// stays the same whether the month is 28 or 31 days long.
const CALENDAR_DAYS_PER_MONTH = 30;
const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function toMs(isoOrDateOrMs) {
  if (typeof isoOrDateOrMs === 'number') return isoOrDateOrMs;
  if (isoOrDateOrMs instanceof Date) return isoOrDateOrMs.getTime();
  return new Date(isoOrDateOrMs).getTime();
}

function getRiyadhParts(isoOrDateOrMs) {
  const date = new Date(toMs(isoOrDateOrMs));
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const map = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  return map;
}

// "YYYY-MM-DD" for the Riyadh calendar day containing this instant
function toRiyadhDateKey(isoOrDateOrMs) {
  const { year, month, day } = getRiyadhParts(isoOrDateOrMs);
  return `${year}-${month}-${day}`;
}

function getRiyadhDayOfWeek(isoOrDateOrMs) {
  return WEEKDAY_INDEX[getRiyadhParts(isoOrDateOrMs).weekday];
}

function isWeekend(isoOrDateOrMs) {
  const dow = getRiyadhDayOfWeek(isoOrDateOrMs);
  return dow === 5 || dow === 6; // Friday or Saturday
}

// 12-hour clock, e.g. "3:45 PM"
function formatTime12h(isoOrDateOrMs) {
  if (!isoOrDateOrMs) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(toMs(isoOrDateOrMs)));
}

// e.g. "Jul 19, 2026, 3:45 PM"
function formatDateTime12h(isoOrDateOrMs) {
  if (!isoOrDateOrMs) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(toMs(isoOrDateOrMs)));
}

// Midnight-to-midnight (exclusive) range, in UTC ms, for the Riyadh day containing this instant
function getRiyadhDayRange(isoOrDateOrMs) {
  const dateKey = toRiyadhDateKey(isoOrDateOrMs);
  const [y, m, d] = dateKey.split('-').map(Number);
  const dayStartMs = Date.UTC(y, m - 1, d) - RIYADH_OFFSET_MS;
  return { dateKey, dayStartMs, dayEndMs: dayStartMs + DAY_MS };
}

// Sunday 00:00 (Riyadh) through end-of-Thursday 23:59:59.999, as the work week containing this instant
function getWeekRange(isoOrDateOrMs) {
  const dow = getRiyadhDayOfWeek(isoOrDateOrMs);
  const { dayStartMs } = getRiyadhDayRange(isoOrDateOrMs);
  const weekStartMs = dayStartMs - dow * DAY_MS;
  const weekEndMs = weekStartMs + 5 * DAY_MS - 1; // Sun..Thu inclusive = 5 days
  return {
    weekStart: new Date(weekStartMs).toISOString(),
    weekEnd: new Date(weekEndMs).toISOString(),
    weekStartMs,
    weekEndMs,
  };
}

// Split a [startMs, endMs) interval into per-Riyadh-calendar-day segments.
// Needed so a shift that happens to cross local midnight is still attributed
// to the correct day(s) for daily-overtime purposes.
function splitByRiyadhDay(startMs, endMs) {
  const segments = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const { dateKey, dayEndMs } = getRiyadhDayRange(cursor);
    const segEnd = Math.min(endMs, dayEndMs);
    segments.push({ dateKey, startMs: cursor, endMs: segEnd });
    cursor = segEnd;
  }
  return segments;
}

// entry: { clock_in, clock_out, breaks: [{ break_start, break_end }] }
// Returns per-day { dateKey, workedMs, breakMs } segments with break overlap subtracted.
function dailyBreakdown(entry) {
  const start = toMs(entry.clock_in);
  const end = toMs(entry.clock_out || Date.now());
  const breaks = (entry.breaks || []).map((b) => ({
    start: toMs(b.break_start),
    end: toMs(b.break_end || Date.now()),
  }));

  return splitByRiyadhDay(start, end).map((seg) => {
    let segBreakMs = 0;
    for (const b of breaks) {
      const overlapStart = Math.max(seg.startMs, b.start);
      const overlapEnd = Math.min(seg.endMs, b.end);
      if (overlapEnd > overlapStart) segBreakMs += overlapEnd - overlapStart;
    }
    const grossMs = seg.endMs - seg.startMs;
    return {
      dateKey: seg.dateKey,
      workedMs: Math.max(0, grossMs - segBreakMs),
      breakMs: segBreakMs,
    };
  });
}

// Calendar-month range (Riyadh-local), as UTC ms/ISO boundaries
function getMonthRange(isoOrDateOrMs) {
  const [y, m] = toRiyadhDateKey(isoOrDateOrMs).split('-').map(Number);
  const monthStartMs = Date.UTC(y, m - 1, 1) - RIYADH_OFFSET_MS;
  const monthEndMs = Date.UTC(y, m, 1) - RIYADH_OFFSET_MS - 1;
  return {
    monthStart: new Date(monthStartMs).toISOString(),
    monthEnd: new Date(monthEndMs).toISOString(),
    monthStartMs,
    monthEndMs,
  };
}

// Inclusive list of "YYYY-MM-DD" Riyadh day keys between two ms boundaries
function listDayKeys(startMs, endMs) {
  const keys = [];
  let cursor = startMs;
  while (cursor <= endMs) {
    keys.push(toRiyadhDateKey(cursor));
    cursor += DAY_MS;
  }
  return keys;
}

function msToHours(ms) {
  return ms / HOUR_MS;
}

// Given total worked ms for a single day, split into regular vs overtime (>10h/day, 1.5x)
function splitRegularOvertime(workedMs) {
  const regularMs = Math.min(workedMs, OVERTIME_THRESHOLD_MS);
  const overtimeMs = Math.max(0, workedMs - OVERTIME_THRESHOLD_MS);
  return { regularMs, overtimeMs };
}

// Scheduled working days (Sun-Thu) in the calendar month containing `v`.
// Ranges from 20 to 23, which is exactly why a fixed divisor underpaid people
// in short months.
function countWorkingDaysInMonth(v) {
  const [year, month] = toRiyadhDateKey(v).split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const dow = getRiyadhDayOfWeek(Date.UTC(year, month - 1, day, 12) - RIYADH_OFFSET_MS);
    if (dow >= 0 && dow <= 4) count += 1; // Sun-Thu
  }
  return count;
}

// Everything derives from one figure: the calendar-day wage, salary / 30.
// Absence is charged at that daily wage, and the hour is that same day divided
// by the 10 hours in a working day — so 1500 -> 50/day -> 5.00/hour.
function salaryRates(monthlySalary, workingDaysInMonth) {
  const salary = Number(monthlySalary) || 0;
  const dailyWage = salary / CALENDAR_DAYS_PER_MONTH;
  const days = workingDaysInMonth || 22;
  const hourlyRate = dailyWage / STANDARD_DAILY_HOURS;
  const overtimeRate = hourlyRate * OVERTIME_MULTIPLIER;
  return {
    salary,
    dailyWage,
    hourlyRate,
    overtimeRate,
    // Overtime is counted and paid by the minute, so this is the rate that
    // actually multiplies out in the report.
    overtimeRatePerMinute: overtimeRate / 60,
    workingDaysInMonth: days,
  };
}

// Start from the full salary and deduct only for scheduled days actually
// missed, so working every scheduled day pays exactly the salary in any month,
// long or short. A week gets its proportional share of the same daily wage.
function calculateSalaryPay({
  monthlySalary,
  absentDays,
  overtimeMinutes,
  workingDaysInMonth,
  periodCalendarDays,
  period = 'monthly',
}) {
  const { salary, dailyWage, hourlyRate, overtimeRate, overtimeRatePerMinute } = salaryRates(
    monthlySalary,
    workingDaysInMonth
  );
  // Never let a missing or bad figure turn a payroll total into NaN.
  const minutes = Number(overtimeMinutes) || 0;
  const absent = Number(absentDays) || 0;
  // A month entitles the whole salary; any other window earns its own days at
  // the daily wage, still capped at the salary so a 31-day range cannot exceed it.
  const entitlement =
    period === 'monthly'
      ? salary
      : Math.min((Number(periodCalendarDays) || 0) * dailyWage, salary);
  const absenceDeduction = absent * dailyWage;
  const basePay = Math.max(0, entitlement - absenceDeduction);
  const overtimePay = minutes * overtimeRatePerMinute;
  return {
    salary,
    dailyWage,
    hourlyRate,
    overtimeRate,
    overtimeRatePerMinute,
    workingDaysInMonth,
    absentDays: absent,
    overtimeMinutes: minutes,
    entitlement,
    absenceDeduction: Math.min(absenceDeduction, entitlement),
    basePay,
    overtimePay,
    totalPay: basePay + overtimePay,
  };
}

module.exports = {
  TIME_ZONE,
  DAY_MS,
  HOUR_MS,
  OVERTIME_THRESHOLD_MS,
  OVERTIME_MULTIPLIER,
  CALENDAR_DAYS_PER_MONTH,
  STANDARD_DAILY_HOURS,
  countWorkingDaysInMonth,
  toMs,
  toRiyadhDateKey,
  getRiyadhDayOfWeek,
  isWeekend,
  formatTime12h,
  formatDateTime12h,
  getRiyadhDayRange,
  getWeekRange,
  getMonthRange,
  listDayKeys,
  splitByRiyadhDay,
  dailyBreakdown,
  msToHours,
  splitRegularOvertime,
  salaryRates,
  calculateSalaryPay,
};
