import { useEffect, useState } from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import { api } from '../utils/api.js';
import { formatForDatetimeLocal, toIsoFromRiyadhLocal, formatDisplay } from '../utils/riyadhTime.js';

const EMPTY_FORM = { employee_id: '', clock_in: '', clock_out: '', note: '' };

export default function Records() {
  const { t, lang } = useLang();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState({ employee_id: '', branch_id: '', start: '', end: '' });
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/employees/all', { auth: true }).then(setEmployees).catch((err) => setError(err.message));
    api.get('/branches/all', { auth: true }).then(setBranches).catch((err) => setError(err.message));
    loadRecords({});
  }, []);

  function loadRecords(currentFilters) {
    const params = new URLSearchParams();
    if (currentFilters.employee_id) params.set('employee_id', currentFilters.employee_id);
    if (currentFilters.branch_id) params.set('branch_id', currentFilters.branch_id);
    if (currentFilters.start) params.set('start', currentFilters.start);
    if (currentFilters.end) params.set('end', currentFilters.end);
    api
      .get(`/attendance/records?${params.toString()}`, { auth: true })
      .then(setRecords)
      .catch((err) => setError(err.message));
  }

  function applyFilters(e) {
    e.preventDefault();
    loadRecords(filters);
  }

  function employeeName(id) {
    const emp = employees.find((e) => e.id === id);
    if (!emp) return '—';
    return lang === 'ar' && emp.name_ar ? emp.name_ar : emp.name_en;
  }

  function branchName(entry) {
    if (!entry.branch_id) return null;
    return lang === 'ar' && entry.branch_name_ar ? entry.branch_name_ar : entry.branch_name_en;
  }

  function breakMinutes(entry) {
    const totalMs = (entry.breaks || []).reduce((sum, b) => {
      const end = b.break_end ? new Date(b.break_end).getTime() : Date.now();
      return sum + Math.max(0, end - new Date(b.break_start).getTime());
    }, 0);
    return Math.round(totalMs / 60000);
  }

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  }

  function openEditForm(entry) {
    setEditingId(entry.id);
    setForm({
      employee_id: String(entry.employee_id),
      clock_in: formatForDatetimeLocal(entry.clock_in),
      clock_out: formatForDatetimeLocal(entry.clock_out),
      note: entry.edit_note || '',
    });
    setFormError('');
    setFormOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!form.note.trim()) {
      setFormError(t('records.noteRequired'));
      return;
    }
    setSubmitting(true);
    const payload = {
      employee_id: Number(form.employee_id),
      clock_in: toIsoFromRiyadhLocal(form.clock_in),
      clock_out: form.clock_out ? toIsoFromRiyadhLocal(form.clock_out) : null,
      note: form.note.trim(),
    };
    try {
      if (editingId) {
        await api.put(`/attendance/${editingId}`, payload, { auth: true });
      } else {
        await api.post('/attendance/manual', payload, { auth: true });
      }
      setFormOpen(false);
      loadRecords(filters);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm(t('records.confirmDelete'))) return;
    try {
      await api.del(`/attendance/${id}`, { auth: true });
      loadRecords(filters);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{t('records.title')}</h1>
        <button
          type="button"
          onClick={openAddForm}
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
        >
          {t('records.addManualEntry')}
        </button>
      </div>

      {error && <p className="mb-4 font-semibold text-red-600">{error}</p>}

      <form onSubmit={applyFilters} className="mb-6 flex flex-wrap items-end gap-4 rounded-2xl bg-white p-4 shadow">
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-600">{t('records.filterEmployee')}</label>
          <select
            className="input"
            value={filters.employee_id}
            onChange={(e) => setFilters({ ...filters, employee_id: e.target.value })}
          >
            <option value="">{t('records.allEmployees')}</option>
            {employees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.name_en}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-600">{t('records.filterBranch')}</label>
          <select
            className="input"
            value={filters.branch_id}
            onChange={(e) => setFilters({ ...filters, branch_id: e.target.value })}
          >
            <option value="">{t('records.allBranches')}</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {lang === 'ar' && branch.name_ar ? branch.name_ar : branch.name_en}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-600">{t('records.startDate')}</label>
          <input
            type="date"
            className="input"
            value={filters.start}
            onChange={(e) => setFilters({ ...filters, start: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-semibold text-slate-600">{t('records.endDate')}</label>
          <input
            type="date"
            className="input"
            value={filters.end}
            onChange={(e) => setFilters({ ...filters, end: e.target.value })}
          />
        </div>
        <button type="submit" className="rounded-lg bg-slate-700 px-5 py-2.5 font-semibold text-white hover:bg-slate-800">
          {t('records.apply')}
        </button>
      </form>

      {formOpen && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-bold text-slate-800">
            {editingId ? t('records.editEntry') : t('records.addManualEntry')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">{t('records.filterEmployee')}</label>
              <select
                className="input"
                value={form.employee_id}
                disabled={!!editingId}
                onChange={(e) => setForm({ ...form, employee_id: e.target.value })}
                required
              >
                <option value="" disabled>
                  {t('records.filterEmployee')}
                </option>
                {employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name_en}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">{t('records.clockIn')}</label>
              <input
                type="datetime-local"
                className="input"
                value={form.clock_in}
                onChange={(e) => setForm({ ...form, clock_in: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">{t('records.clockOut')}</label>
              <input
                type="datetime-local"
                className="input"
                value={form.clock_out}
                onChange={(e) => setForm({ ...form, clock_out: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-semibold text-slate-600">{t('records.note')}</label>
              <input
                className="input"
                placeholder={t('records.notePlaceholder')}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </div>
          </div>
          {formError && <p className="mt-3 font-semibold text-red-600">{formError}</p>}
          <div className="mt-4 flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {t('common.save')}
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg bg-slate-200 px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-300"
            >
              {t('common.cancel')}
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl bg-white shadow">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-100 text-sm text-slate-400">
              <th className="px-4 py-3">{t('common.name')}</th>
              <th className="px-4 py-3">{t('records.clockIn')}</th>
              <th className="px-4 py-3">{t('records.clockOut')}</th>
              <th className="px-4 py-3">{t('records.breakTime')}</th>
              <th className="px-4 py-3">{t('common.status')}</th>
              <th className="px-4 py-3">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {records.map((entry) => (
              <tr key={entry.id} className="border-b border-slate-50 align-top">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-800">{employeeName(entry.employee_id)}</p>
                  {branchName(entry) && <p className="text-xs text-slate-400">{branchName(entry)}</p>}
                </td>
                <td className="px-4 py-3 text-slate-600">{formatDisplay(entry.clock_in)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {entry.clock_out ? formatDisplay(entry.clock_out) : (
                    <span className="font-semibold text-green-600">{t('records.stillClockedIn')}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {breakMinutes(entry)} {t('common.minutes')}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {!!entry.is_edited && (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                        {t('records.edited')}
                      </span>
                    )}
                    {!!entry.auto_clock_out && (
                      <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
                        {t('records.autoClockOut')}
                      </span>
                    )}
                    {!!entry.left_zone_at && (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                        {t('records.leftZone')}
                      </span>
                    )}
                  </div>
                  {entry.edit_note && <p className="mt-1 text-xs text-slate-400">{entry.edit_note}</p>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => openEditForm(entry)}
                      className="text-sm font-semibold text-blue-600"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(entry.id)}
                      className="text-sm font-semibold text-red-600"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {records.length === 0 && <p className="p-6 text-center text-slate-400">{t('records.noRecords')}</p>}
      </div>
    </div>
  );
}
