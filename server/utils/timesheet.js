const { all } = require('../db/db');
const {
  dailyBreakdown,
  listDayKeys,
  isWeekend,
  splitRegularOvertime,
  calculateSalaryPay,
  countWorkingDaysInMonth,
  toRiyadhDateKey,
  msToHours,
} = require('./time');

// Builds a per-day timesheet for one employee across [periodStartMs, periodEndMs].
// The salary cap only makes sense over a whole month, so weekly reports accrue
// pay per day worked without capping and without an absence deduction.
async function computeTimesheet(employee, periodStartMs, periodEndMs, { period = 'monthly' } = {}) {
  const entries = await all(
    `SELECT * FROM time_entries
     WHERE employee_id = $1 AND clock_in >= $2 AND clock_in <= $3
     ORDER BY clock_in`,
    [employee.id, new Date(periodStartMs).toISOString(), new Date(periodEndMs).toISOString()]
  );

  const byDay = new Map(); // dateKey -> { workedMs, breakMs }

  for (const entry of entries) {
    const breaks = await all('SELECT * FROM breaks WHERE time_entry_id = $1', [entry.id]);
    const segments = dailyBreakdown({ ...entry, breaks });
    for (const seg of segments) {
      const acc = byDay.get(seg.dateKey) || { workedMs: 0, breakMs: 0 };
      acc.workedMs += seg.workedMs;
      acc.breakMs += seg.breakMs;
      byDay.set(seg.dateKey, acc);
    }
  }

  const days = listDayKeys(periodStartMs, periodEndMs).map((dateKey) => {
    const acc = byDay.get(dateKey) || { workedMs: 0, breakMs: 0 };
    const { regularMs, overtimeMs } = splitRegularOvertime(acc.workedMs);
    return {
      dateKey,
      isWeekend: isWeekend(`${dateKey}T12:00:00.000Z`),
      workedHours: round2(msToHours(acc.workedMs)),
      breakHours: round2(msToHours(acc.breakMs)),
      regularHours: round2(msToHours(regularMs)),
      overtimeHours: round2(msToHours(overtimeMs)),
      overtimeMinutes: Math.round(overtimeMs / 60000),
    };
  });

  const totals = days.reduce(
    (acc, d) => {
      acc.workedHours += d.workedHours;
      acc.breakHours += d.breakHours;
      acc.regularHours += d.regularHours;
      acc.overtimeHours += d.overtimeHours;
      acc.overtimeMinutes += d.overtimeMinutes;
      return acc;
    },
    { workedHours: 0, breakHours: 0, regularHours: 0, overtimeHours: 0, overtimeMinutes: 0 }
  );

  // Only scheduled days (Sun-Thu) that have already passed can be an absence.
  // Counting the rest of an unfinished month would wipe out the salary on the
  // 1st of every month. Today is not over yet either: a report opened at 8am,
  // before anyone has clocked in, must not deduct today.
  const todayKey = toRiyadhDateKey(Date.now());
  const elapsedDays = days.filter((d) => d.dateKey <= todayKey);
  const scheduledDays = elapsedDays.filter((d) => !d.isWeekend);
  const absentDays = scheduledDays.filter(
    (d) => d.workedHours === 0 && d.dateKey < todayKey
  ).length;
  const daysWorked = days.filter((d) => d.workedHours > 0).length;
  const periodInProgress = days.some((d) => d.dateKey > todayKey);

  const pay = calculateSalaryPay({
    monthlySalary: employee.monthly_salary,
    absentDays,
    overtimeMinutes: totals.overtimeMinutes,
    workingDaysInMonth: countWorkingDaysInMonth(periodStartMs),
    // The salary covers rest days too, so a week is worth 7 days of it even
    // though the Sun-Thu reporting window only spans 5.
    periodCalendarDays: period === 'weekly' ? 7 : days.length,
    period,
  });

  return {
    employee: {
      id: employee.id,
      name_en: employee.name_en,
      name_ar: employee.name_ar,
      role: employee.role,
      branch_id: employee.branch_id ?? null,
      branch_name_en: employee.branch_name_en ?? null,
      branch_name_ar: employee.branch_name_ar ?? null,
    },
    days,
    totals: {
      ...roundAll(totals),
      daysWorked,
      absentDays,
      scheduledDays: scheduledDays.length,
      workingDaysInMonth: pay.workingDaysInMonth,
      periodInProgress,
      monthlySalary: round2(pay.salary),
      dailyWage: round2(pay.dailyWage),
      hourlyRate: round2(pay.hourlyRate),
      overtimeRate: round2(pay.overtimeRate),
      overtimeMinutes: pay.overtimeMinutes,
      overtimeRatePerMinute: Math.round(pay.overtimeRatePerMinute * 10000) / 10000,
      entitlement: round2(pay.entitlement),
      basePay: round2(pay.basePay),
      overtimePay: round2(pay.overtimePay),
      absenceDeduction: round2(pay.absenceDeduction),
      totalPay: round2(pay.totalPay),
      salaryMissing: !employee.monthly_salary,
    },
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function roundAll(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k] = round2(v);
  return out;
}

module.exports = { computeTimesheet, round2 };
