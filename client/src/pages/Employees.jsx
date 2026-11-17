import { useEffect, useState } from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import { api } from '../utils/api.js';

const EMPTY_FORM = { name_en: '', name_ar: '', pin: '', monthly_salary: '', role: '', branch_id: '' };

export default function Employees() {
  const { t, lang } = useLang();
  const [employees, setEmployees] = useState([]);
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    load();
    api
      .get('/branches/all', { auth: true })
      .then((list) => setBranches(list.filter((b) => b.is_active)))
      .catch((err) => setError(err.message));
  }, []);

  function load() {
    api
      .get('/employees/all', { auth: true })
      .then(setEmployees)
      .catch((err) => setError(err.message));
  }

  function branchLabel(emp) {
    if (!emp.branch_id) return t('employees.noBranch');
    return lang === 'ar' && emp.branch_name_ar ? emp.branch_name_ar : emp.branch_name_en;
  }

  function openAddForm() {
    setEditingId(null);
    // With a single branch there's nothing to choose — preselect it.
    setForm({ ...EMPTY_FORM, branch_id: branches.length === 1 ? String(branches[0].id) : '' });
    setFormError('');
    setFormOpen(true);
  }

  function openEditForm(emp) {
    setEditingId(emp.id);
    setForm({
      name_en: emp.name_en,
      name_ar: emp.name_ar || '',
      pin: '',
      monthly_salary: emp.monthly_salary === null ? '' : String(emp.monthly_salary),
      role: emp.role,
      branch_id: emp.branch_id ? String(emp.branch_id) : '',
    });
    setFormError('');
    setFormOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/employees/${editingId}`, form, { auth: true });
      } else {
        await api.post('/employees', form, { auth: true });
      }
      setFormOpen(false);
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleActive(emp) {
    if (emp.is_active && !window.confirm(t('employees.confirmDeactivate'))) return;
    const action = emp.is_active ? 'deactivate' : 'activate';
    try {
      await api.patch(`/employees/${emp.id}/${action}`, undefined, { auth: true });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">{t('employees.title')}</h1>
        <button
          type="button"
          onClick={openAddForm}
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
        >
          {t('employees.addEmployee')}
        </button>
      </div>

      {error && <p className="mb-4 font-semibold text-red-600">{error}</p>}

      {formOpen && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-bold text-slate-800">
            {editingId ? t('employees.editEmployee') : t('employees.addEmployee')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('employees.nameEn')} required>
              <input
                className="input"
                value={form.name_en}
                onChange={(e) => setForm({ ...form, name_en: e.target.value })}
              />
            </Field>
            <Field label={t('employees.nameAr')}>
              <input
                className="input"
                dir="rtl"
                value={form.name_ar}
                onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
              />
            </Field>
            <Field label={t('employees.pin')} hint={editingId ? t('employees.pinHint') : null} required={!editingId}>
              <input
                className="input"
                inputMode="numeric"
                maxLength={4}
                value={form.pin}
                onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, '') })}
              />
            </Field>
            <Field label={t('employees.monthlySalary')} hint={t('employees.salaryHint')} required>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.monthly_salary}
                onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })}
              />
            </Field>
            <Field label={t('employees.role')}>
              <input className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
            </Field>
            <Field label={t('employees.branch')} required={branches.length > 0}>
              <select
                className="input"
                value={form.branch_id}
                onChange={(e) => setForm({ ...form, branch_id: e.target.value })}
              >
                <option value="">{t('employees.selectBranch')}</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {lang === 'ar' && branch.name_ar ? branch.name_ar : branch.name_en}
                  </option>
                ))}
              </select>
            </Field>
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
              <th className="px-4 py-3">{t('employees.branch')}</th>
              <th className="px-4 py-3">{t('employees.role')}</th>
              <th className="px-4 py-3">{t('employees.monthlySalary')}</th>
              <th className="px-4 py-3">{t('common.status')}</th>
              <th className="px-4 py-3">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((emp) => (
              <tr key={emp.id} className="border-b border-slate-50">
                <td className="px-4 py-3">
                  <p className="font-semibold text-slate-800">{emp.name_en}</p>
                  {emp.name_ar && <p className="text-sm text-slate-400">{emp.name_ar}</p>}
                </td>
                <td className={`px-4 py-3 ${emp.branch_id ? 'text-slate-600' : 'text-amber-600'}`}>
                  {branchLabel(emp)}
                </td>
                <td className="px-4 py-3 text-slate-600">{emp.role}</td>
                <td className={`px-4 py-3 ${emp.monthly_salary === null ? 'text-amber-600' : 'text-slate-600'}`}>
                  {emp.monthly_salary === null
                    ? t('employees.salaryNotSet')
                    : `${emp.monthly_salary} ${t('common.sar')}`}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      emp.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {emp.is_active ? t('employees.active') : t('employees.inactive')}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button type="button" onClick={() => openEditForm(emp)} className="text-sm font-semibold text-blue-600">
                      {t('common.edit')}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleActive(emp)}
                      className="text-sm font-semibold text-slate-500"
                    >
                      {emp.is_active ? t('employees.deactivate') : t('employees.activate')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {employees.length === 0 && <p className="p-6 text-center text-slate-400">{t('employees.noEmployees')}</p>}
      </div>
    </div>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
