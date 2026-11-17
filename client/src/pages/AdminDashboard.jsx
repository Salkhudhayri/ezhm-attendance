import { useEffect, useState } from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import { api } from '../utils/api.js';

const POLL_MS = 30000;

export default function AdminDashboard() {
  const { t, lang } = useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, []);

  function load() {
    api
      .get('/reports/dashboard', { auth: true })
      .then(setData)
      .catch((err) => setError(err.message));
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-2xl font-bold text-slate-800">{t('admin.dashboard')}</h1>

      {error && <p className="mb-4 font-semibold text-red-600">{error}</p>}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="text-sm font-semibold uppercase text-slate-400">{t('admin.todayTotalHours')}</p>
          <p className="mt-2 text-4xl font-bold text-blue-600">
            {data ? data.todayTotalHours : '—'} <span className="text-lg text-slate-400">{t('common.hours')}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-white p-6 shadow">
          <p className="text-sm font-semibold uppercase text-slate-400">{t('admin.currentlyClockedIn')}</p>
          <p className="mt-2 text-4xl font-bold text-green-600">{data ? data.currentlyClockedInCount : '—'}</p>
        </div>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-bold text-slate-800">{t('admin.currentlyClockedIn')}</h2>
        {data && data.currentlyClockedIn.length === 0 && (
          <p className="text-slate-400">{t('admin.noOneClockedIn')}</p>
        )}
        <ul className="divide-y divide-slate-100">
          {data &&
            data.currentlyClockedIn.map((entry) => (
              <li key={entry.employeeId} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-semibold text-slate-800">
                    {lang === 'ar' && entry.name_ar ? entry.name_ar : entry.name_en}
                  </p>
                  <p className="text-sm text-slate-400">
                    {entry.role}
                    {entry.branch_name_en &&
                      ` — ${lang === 'ar' && entry.branch_name_ar ? entry.branch_name_ar : entry.branch_name_en}`}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                      entry.status === 'on_break' ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {entry.status === 'on_break' ? t('kiosk.statusOnBreak') : t('kiosk.statusClockedIn')}
                  </span>
                  <p className="mt-1 text-sm text-slate-400">{entry.clockInTime}</p>
                </div>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}
