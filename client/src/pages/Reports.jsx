import { useEffect, useState } from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import { api, downloadCsv } from '../utils/api.js';

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

export default function Reports() {
  const { t, lang } = useLang();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState('');
  const [period, setPeriod] = useState('weekly');
  const [date, setDate] = useState(todayDateInput());
  const [rangeStart, setRangeStart] = useState(() => todayDateInput().slice(0, 8) + '01');
  const [rangeEnd, setRangeEnd] = useState(todayDateInput());
  const [employeeId, setEmployeeId] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    api.get('/employees/all', { auth: true }).then(setEmployees).catch(() => {});
    api.get('/branches/all', { auth: true }).then(setBranches).catch(() => {});
    load();
  }, []);

  // A specific employee already implies their branch, so the branch filter is
  // only applied when the report covers everyone.
  function buildParams() {
    const params = new URLSearchParams({ period });
    if (period === 'custom') {
      params.set('start', rangeStart);
      params.set('end', rangeEnd);
    } else {
      params.set('date', date);
    }
    if (employeeId) params.set('employee_id', employeeId);
    else if (branchId) params.set('branch_id', branchId);
    return params;
  }

  function load() {
    setError('');
    api
      .get(`/reports/timesheet?${buildParams().toString()}`, { auth: true })
      .then(setReport)
      .catch((err) => setError(err.message));
  }

  async function handleExport() {
    setExporting(true);
    setError('');
    try {
      await downloadCsv(`/reports/export?${buildParams().toString()}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">{t('reports.title')}</h1>

      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-2xl bg-white p-4 shadow">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPeriod('weekly')}
            className={`rounded-lg px-4 py-2 font-semibold ${
              period === 'weekly' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {t('reports.weekly')}
          </button>
          <button
            type="button"
            onClick={() => setPeriod('monthly')}
            className={`rounded-lg px-4 py-2 font-semibold ${
              period === 'monthly' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {t('reports.monthly')}
          </button>
          <button
            type="button"
            onClick={() => setPeriod('custom')}
            className={`rounded-lg px-4 py-2 font-semibold ${
              period === 'custom' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {t('reports.custom')}
          </button>
        </div>
        {period === 'custom' ? (
          <>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">{t('reports.from')}</label>
              <input
                type="date"
                className="input"
                value={rangeStart}
                max={rangeEnd}
                onChange={(e) => setRangeStart(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">{t('reports.to')}</label>
              <input
                type="date"
                className="input"
                value={rangeEnd}
                min={rangeStart}
                onChange={(e) => setRangeEnd(e.target.value)}
              />
            </div>
          </>
        ) : (
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">{t('reports.selectPeriodDate')}</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        )}
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-600">{t('reports.branch')}</label>
          <select
            className="input"
            value={branchId}
            disabled={!!employeeId}
            onChange={(e) => setBranchId(e.target.value)}
          >
            <option value="">{t('reports.allBranches')}</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {lang === 'ar' && branch.name_ar ? branch.name_ar : branch.name_en}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-600">{t('reports.employee')}</label>
          <select className="input" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">{t('reports.allEmployees')}</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name_en}
              </option>
            ))}
          </select>
        </div>
        <button type="button" onClick={load} className="rounded-lg bg-slate-700 px-5 py-2.5 font-semibold text-white hover:bg-slate-800">
          {t('records.apply')}
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="rounded-lg bg-green-600 px-5 py-2.5 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
        >
          {t('reports.exportCsv')}
        </button>
      </div>

      {error && <p className="mb-4 font-semibold text-red-600">{error}</p>}

      {report && (
        <p className="mb-4 text-sm text-slate-500">
          {t('reports.periodRange', { start: report.periodStart, end: report.periodEnd })}
        </p>
      )}

      <div className="flex flex-col gap-6">
        {report &&
          report.timesheets.map((ts) => (
            <div key={ts.employee.id} className="rounded-2xl bg-white p-6 shadow">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{ts.employee.name_en}</h2>
                  {ts.employee.branch_name_en && (
                    <p className="text-sm text-slate-400">
                      {lang === 'ar' && ts.employee.branch_name_ar
                        ? ts.employee.branch_name_ar
                        : ts.employee.branch_name_en}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                  <span>
                    {t('reports.regularHours')}: <b className="text-slate-700">{ts.totals.regularHours}</b>
                  </span>
                  <span>
                    {t('reports.overtimeMinutes')}: <b className="text-amber-600">{ts.totals.overtimeMinutes}</b>
                  </span>
                  <span>
                    {t('reports.breakHours')}: <b className="text-slate-700">{ts.totals.breakHours}</b>
                  </span>
                  <span>
                    {t('reports.totalPay')}:{' '}
                    <b className="text-green-700">
                      {ts.totals.totalPay} {t('common.sar')}
                    </b>
                  </span>
                </div>
              </div>

              {/* How the total was reached, so the figure can be checked by hand. */}
              <div className="mb-4 rounded-xl bg-slate-50 p-4 text-sm">
                {ts.totals.salaryMissing ? (
                  <p className="font-semibold text-amber-600">{t('reports.salaryNotSet')}</p>
                ) : (
                  <div className="flex flex-col gap-1 text-slate-600">
                    <div className="flex justify-between">
                      <span>{t('reports.fullSalary')}</span>
                      <b className="text-slate-800">
                        {ts.totals.entitlement} {t('common.sar')}
                      </b>
                    </div>
                    {ts.totals.absenceDeduction > 0 ? (
                      <div className="flex justify-between text-amber-700">
                        <span>
                          {t('reports.absenceDeduction', {
                            days: ts.totals.absentDays,
                            rate: ts.totals.dailyWage,
                          })}
                        </span>
                        <b>
                          −{ts.totals.absenceDeduction} {t('common.sar')}
                        </b>
                      </div>
                    ) : (
                      <div className="flex justify-between text-green-700">
                        <span>{t('reports.noAbsence', { days: ts.totals.scheduledDays })}</span>
                        <b>0 {t('common.sar')}</b>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span>
                        {t('reports.overtimePay')} — {ts.totals.overtimeMinutes} {t('common.minutes')} ×{' '}
                        {ts.totals.overtimeRatePerMinute} {t('common.sar')}
                      </span>
                      <b className="text-amber-700">
                        {ts.totals.overtimePay} {t('common.sar')}
                      </b>
                    </div>
                    <div className="mt-1 flex justify-between border-t border-slate-200 pt-1">
                      <span className="font-semibold text-slate-700">{t('reports.totalPay')}</span>
                      <b className="text-green-700">
                        {ts.totals.totalPay} {t('common.sar')}
                      </b>
                    </div>
                    <p className="mt-2 text-xs text-slate-400">
                      {t('reports.rateNote', {
                        salary: ts.totals.monthlySalary,
                        dailyWage: ts.totals.dailyWage,
                        workingDays: ts.totals.workingDaysInMonth,
                        hourly: ts.totals.hourlyRate,
                        overtime: ts.totals.overtimeRate,
                        perMinute: ts.totals.overtimeRatePerMinute,
                      })}
                    </p>
                    {ts.totals.periodInProgress && (
                      <p className="text-xs text-blue-600">{t('reports.inProgress')}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-400">
                      <th className="py-2 pr-4">{t('common.date')}</th>
                      <th className="py-2 pr-4">{t('reports.workedHours')}</th>
                      <th className="py-2 pr-4">{t('reports.breakHours')}</th>
                      <th className="py-2 pr-4">{t('reports.regularHours')}</th>
                      <th className="py-2 pr-4">{t('reports.overtimeMinutes')}</th>
                      <th className="py-2 pr-4">{t('reports.weekend')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ts.days.map((day) => (
                      <tr key={day.dateKey} className={`border-b border-slate-50 ${day.isWeekend ? 'bg-slate-50' : ''}`}>
                        <td className="py-2 pr-4">{day.dateKey}</td>
                        <td className="py-2 pr-4">{day.workedHours}</td>
                        <td className="py-2 pr-4">{day.breakHours}</td>
                        <td className="py-2 pr-4">{day.regularHours}</td>
                        <td className="py-2 pr-4 text-amber-600">{day.overtimeMinutes}</td>
                        <td className="py-2 pr-4">{day.isWeekend ? t('common.yes') : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        {report && report.timesheets.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-center text-slate-400 shadow">{t('employees.noEmployees')}</p>
        )}
      </div>
    </div>
  );
}
