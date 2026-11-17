const express = require('express');
const { all } = require('../db/db');
const { requireAdmin } = require('../middleware/auth');
const {
  getWeekRange,
  getMonthRange,
  getRiyadhDayRange,
  toRiyadhDateKey,
  dailyBreakdown,
  msToHours,
  formatTime12h,
} = require('../utils/time');
const { computeTimesheet, round2 } = require('../utils/timesheet');
const { toCsv } = require('../utils/csv');

const router = express.Router();

// Note: periodStart/periodEnd (Riyadh midnight instants) are UTC-3h, so slicing their
// ISO string would show the wrong calendar date — always use the *Key (Riyadh date) fields
// for display or filenames instead.
const MAX_CUSTOM_DAYS = 366;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function resolvePeriodRange(period, dateStr, startStr, endStr) {
  const anchor = dateStr ? `${dateStr}T12:00:00.000Z` : Date.now();

  // A free date range, e.g. 2026-11-01 to 2026-11-10 inclusive.
  if (period === 'custom') {
    if (!DATE_RE.test(startStr || '') || !DATE_RE.test(endStr || '')) {
      throw Object.assign(new Error('A start and end date (YYYY-MM-DD) are required.'), { status: 400 });
    }
    const from = getRiyadhDayRange(`${startStr}T12:00:00.000Z`);
    const to = getRiyadhDayRange(`${endStr}T12:00:00.000Z`);
    if (to.dayEndMs <= from.dayStartMs) {
      throw Object.assign(new Error('The end date must be on or after the start date.'), { status: 400 });
    }
    const spanDays = Math.round((to.dayEndMs - from.dayStartMs) / (24 * 60 * 60 * 1000));
    if (spanDays > MAX_CUSTOM_DAYS) {
      throw Object.assign(new Error(`A custom range can cover at most ${MAX_CUSTOM_DAYS} days.`), { status: 400 });
    }
    return {
      periodStart: new Date(from.dayStartMs).toISOString(),
      periodEnd: new Date(to.dayEndMs - 1).toISOString(),
      periodStartMs: from.dayStartMs,
      periodEndMs: to.dayEndMs - 1,
      periodStartKey: from.dateKey,
      periodEndKey: to.dateKey,
    };
  }

  if (period === 'monthly') {
    const { monthStart, monthEnd, monthStartMs, monthEndMs } = getMonthRange(anchor);
    return {
      periodStart: monthStart,
      periodEnd: monthEnd,
      periodStartMs: monthStartMs,
      periodEndMs: monthEndMs,
      periodStartKey: toRiyadhDateKey(monthStartMs),
      periodEndKey: toRiyadhDateKey(monthEndMs),
    };
  }
  const { weekStart, weekEnd, weekStartMs, weekEndMs } = getWeekRange(anchor);
  return {
    periodStart: weekStart,
    periodEnd: weekEnd,
    periodStartMs: weekStartMs,
    periodEndMs: weekEndMs,
    periodStartKey: toRiyadhDateKey(weekStartMs),
    periodEndKey: toRiyadhDateKey(weekEndMs),
  };
}

async function employeesForReport(employeeId, branchId) {
  if (employeeId) {
    return all(
      `SELECT e.*, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
       FROM employees e LEFT JOIN branches b ON b.id = e.branch_id
       WHERE e.id = $1`,
      [Number(employeeId)]
    );
  }
  if (branchId) {
    return all(
      `SELECT e.*, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
       FROM employees e LEFT JOIN branches b ON b.id = e.branch_id
       WHERE e.is_active = TRUE AND e.branch_id = $1
       ORDER BY e.name_en`,
      [Number(branchId)]
    );
  }
  return all(
    `SELECT e.*, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
     FROM employees e LEFT JOIN branches b ON b.id = e.branch_id
     WHERE e.is_active = TRUE
     ORDER BY b.id NULLS FIRST, e.name_en`
  );
}

// GET /api/reports/dashboard — admin: who's clocked in now + today's totals
router.get('/dashboard', requireAdmin, async (req, res, next) => {
  try {
    const todayKey = toRiyadhDateKey(Date.now());
    const { dayStartMs, dayEndMs } = getRiyadhDayRange(Date.now());

    const openEntries = await all(
      `SELECT te.*, e.name_en, e.name_ar, e.role, e.branch_id, b.name_en AS branch_name_en, b.name_ar AS branch_name_ar
       FROM time_entries te
       JOIN employees e ON e.id = te.employee_id
       LEFT JOIN branches b ON b.id = e.branch_id
       WHERE te.clock_out IS NULL
       ORDER BY e.branch_id NULLS FIRST, te.clock_in`
    );

    const currentlyClockedIn = await Promise.all(
      openEntries.map(async (entry) => {
        const breaks = await all('SELECT * FROM breaks WHERE time_entry_id = $1', [entry.id]);
        const openBreak = breaks.find((b) => !b.break_end);
        return {
          employeeId: entry.employee_id,
          name_en: entry.name_en,
          name_ar: entry.name_ar,
          role: entry.role,
          branch_id: entry.branch_id,
          branch_name_en: entry.branch_name_en,
          branch_name_ar: entry.branch_name_ar,
          clockInTime: formatTime12h(entry.clock_in),
          status: openBreak ? 'on_break' : 'clocked_in',
        };
      })
    );

    // Today's total worked hours across everyone: any entry that could overlap today
    const candidateEntries = await all(
      `SELECT * FROM time_entries
       WHERE clock_in <= $1 AND (clock_out IS NULL OR clock_out >= $2)`,
      [new Date(dayEndMs).toISOString(), new Date(dayStartMs).toISOString()]
    );

    let todayWorkedMs = 0;
    for (const entry of candidateEntries) {
      const breaks = await all('SELECT * FROM breaks WHERE time_entry_id = $1', [entry.id]);
      const segments = dailyBreakdown({ ...entry, breaks });
      for (const seg of segments) {
        if (seg.dateKey === todayKey) todayWorkedMs += seg.workedMs;
      }
    }

    res.json({
      date: todayKey,
      currentlyClockedIn,
      currentlyClockedInCount: currentlyClockedIn.length,
      todayTotalHours: round2(msToHours(todayWorkedMs)),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/timesheet?period=weekly|monthly&date=YYYY-MM-DD&employee_id=&branch_id= (both optional)
router.get('/timesheet', requireAdmin, async (req, res, next) => {
  try {
    const period = ['monthly', 'custom'].includes(req.query.period) ? req.query.period : 'weekly';
    const { periodStartKey, periodEndKey, periodStartMs, periodEndMs } = resolvePeriodRange(
      period,
      req.query.date,
      req.query.start,
      req.query.end
    );
    const employees = await employeesForReport(req.query.employee_id, req.query.branch_id);

    const timesheets = await Promise.all(
      employees.map((emp) => computeTimesheet(emp, periodStartMs, periodEndMs, { period }))
    );

    res.json({ period, periodStart: periodStartKey, periodEnd: periodEndKey, timesheets });
  } catch (err) {
    next(err);
  }
});

// GET /api/reports/export?period=weekly|monthly&date=YYYY-MM-DD&employee_id=&branch_id= — CSV download
router.get('/export', requireAdmin, async (req, res, next) => {
  try {
    const period = ['monthly', 'custom'].includes(req.query.period) ? req.query.period : 'weekly';
    const { periodStartKey, periodEndKey, periodStartMs, periodEndMs } = resolvePeriodRange(
      period,
      req.query.date,
      req.query.start,
      req.query.end
    );
    const employees = await employeesForReport(req.query.employee_id, req.query.branch_id);

    const rows = [];
    for (const emp of employees) {
      const { days, totals } = await computeTimesheet(emp, periodStartMs, periodEndMs, { period });
      const branch = emp.branch_name_en || '';
      for (const day of days) {
        if (day.workedHours === 0 && day.breakHours === 0) continue;
        rows.push({
          employee: emp.name_en,
          branch,
          date: day.dateKey,
          weekend: day.isWeekend ? 'Yes' : 'No',
          workedHours: day.workedHours,
          breakHours: day.breakHours,
          regularHours: day.regularHours,
          overtimeMinutes: day.overtimeMinutes,
        });
      }
      rows.push({
        employee: `${emp.name_en} — TOTAL`,
        branch,
        date: '',
        weekend: '',
        workedHours: totals.workedHours,
        breakHours: totals.breakHours,
        regularHours: totals.regularHours,
        overtimeMinutes: totals.overtimeMinutes,
        monthlySalary: totals.monthlySalary,
        daysWorked: totals.daysWorked,
        absentDays: totals.absentDays,
        basePay: totals.basePay,
        absenceDeduction: totals.absenceDeduction,
        overtimeRatePerMinute: totals.overtimeRatePerMinute,
        overtimePay: totals.overtimePay,
        totalPay: totals.totalPay,
      });
    }

    const csv = toCsv(rows, [
      { key: 'employee', header: 'Employee' },
      { key: 'branch', header: 'Branch' },
      { key: 'date', header: 'Date' },
      { key: 'weekend', header: 'Weekend' },
      { key: 'workedHours', header: 'Worked Hours' },
      { key: 'breakHours', header: 'Break Hours' },
      { key: 'regularHours', header: 'Regular Hours' },
      { key: 'overtimeMinutes', header: 'Overtime Minutes (1.5x)' },
      { key: 'monthlySalary', header: 'Monthly Salary (SAR)' },
      { key: 'daysWorked', header: 'Days Worked' },
      { key: 'absentDays', header: 'Days Absent' },
      { key: 'basePay', header: 'Base Pay (SAR)' },
      { key: 'absenceDeduction', header: 'Absence Deduction (SAR)' },
      { key: 'overtimeRatePerMinute', header: 'Overtime Rate (SAR/min)' },
      { key: 'overtimePay', header: 'Overtime Pay (SAR)' },
      { key: 'totalPay', header: 'Total Pay (SAR)' },
    ]);

    const filename =
      period === 'custom'
        ? `timesheet_${periodStartKey}_to_${periodEndKey}.csv`
        : `timesheet_${period}_${periodStartKey}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
