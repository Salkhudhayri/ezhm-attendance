import { useEffect, useState } from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import { api } from '../utils/api.js';

const EMPTY_FORM = { name_en: '', name_ar: '', lat: '', lng: '', radiusM: '' };

export default function Branches() {
  const { t } = useLang();
  const [branches, setBranches] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  function load() {
    api
      .get('/branches/all', { auth: true })
      .then(setBranches)
      .catch((err) => setError(err.message));
  }

  function openAddForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setFormOpen(true);
  }

  function openEditForm(branch) {
    setEditingId(branch.id);
    setForm({
      name_en: branch.name_en,
      name_ar: branch.name_ar || '',
      lat: branch.lat === null ? '' : String(branch.lat),
      lng: branch.lng === null ? '' : String(branch.lng),
      radiusM: branch.radiusM === null ? '' : String(branch.radiusM),
    });
    setFormError('');
    setFormOpen(true);
  }

  // Only useful while physically standing at the branch — that's the whole point
  // of the button, so the hint text under it says so.
  function useCurrentLocation() {
    setFormError('');
    if (!navigator.geolocation) {
      setFormError(t('branches.geoNotSupported'));
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          lat: pos.coords.latitude.toFixed(6),
          lng: pos.coords.longitude.toFixed(6),
          radiusM: f.radiusM || '150',
        }));
        setLocating(false);
      },
      (err) => {
        setFormError(err.message || t('branches.geoError'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    setSuccess('');
    setSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/branches/${editingId}`, form, { auth: true });
      } else {
        await api.post('/branches', form, { auth: true });
      }
      setFormOpen(false);
      setSuccess(t('branches.saved'));
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(branch) {
    if (!window.confirm(t('branches.confirmDelete'))) return;
    setError('');
    setSuccess('');
    try {
      await api.del(`/branches/${branch.id}`, { auth: true });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-800">{t('branches.title')}</h1>
        <button
          type="button"
          onClick={openAddForm}
          className="rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700"
        >
          {t('branches.addBranch')}
        </button>
      </div>
      <p className="mb-6 text-slate-500">{t('branches.description')}</p>

      {error && <p className="mb-4 font-semibold text-red-600">{error}</p>}
      {success && <p className="mb-4 font-semibold text-green-600">{success}</p>}

      {formOpen && (
        <form onSubmit={handleSubmit} className="mb-6 rounded-2xl bg-white p-6 shadow">
          <h2 className="mb-4 text-lg font-bold text-slate-800">
            {editingId ? t('branches.editBranch') : t('branches.addBranch')}
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">
                {t('branches.nameEn')} <span className="text-red-500">*</span>
              </label>
              <input
                className="input"
                value={form.name_en}
                onChange={(e) => setForm({ ...form, name_en: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">{t('branches.nameAr')}</label>
              <input
                className="input"
                dir="rtl"
                value={form.name_ar}
                onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-6 mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-slate-700">{t('branches.locationSection')}</h3>
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={locating}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {locating ? t('common.loading') : t('branches.useCurrentLocation')}
            </button>
          </div>
          <p className="mb-3 text-sm text-slate-400">{t('branches.locationHint')}</p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">{t('branches.latitude')}</label>
              <input
                className="input"
                type="number"
                step="any"
                min="-90"
                max="90"
                value={form.lat}
                onChange={(e) => setForm({ ...form, lat: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">{t('branches.longitude')}</label>
              <input
                className="input"
                type="number"
                step="any"
                min="-180"
                max="180"
                value={form.lng}
                onChange={(e) => setForm({ ...form, lng: e.target.value })}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600">{t('branches.radius')}</label>
              <input
                className="input"
                type="number"
                step="any"
                min="1"
                value={form.radiusM}
                onChange={(e) => setForm({ ...form, radiusM: e.target.value })}
              />
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">{t('branches.radiusHint')}</p>

          {formError && <p className="mt-4 font-semibold text-red-600">{formError}</p>}
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

      <div className="flex flex-col gap-4">
        {branches.map((branch) => (
          <div key={branch.id} className="rounded-2xl bg-white p-6 shadow">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-800">{branch.name_en}</h2>
                {branch.name_ar && <p className="text-slate-500">{branch.name_ar}</p>}
                <p className="mt-1 text-sm text-slate-400">
                  {t('branches.employeeCount', { count: branch.employeeCount })}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    branch.zoneConfigured ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {branch.zoneConfigured ? t('branches.zoneConfigured') : t('branches.zoneNotConfigured')}
                </span>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => openEditForm(branch)}
                    className="text-sm font-semibold text-blue-600"
                  >
                    {t('common.edit')}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(branch)}
                    className="text-sm font-semibold text-red-600"
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>
            </div>
            {branch.zoneConfigured && (
              <p className="mt-3 text-sm text-slate-500" dir="ltr">
                {branch.lat}, {branch.lng} — {t('branches.radiusValue', { radius: branch.radiusM })}
              </p>
            )}
          </div>
        ))}
        {branches.length === 0 && (
          <p className="rounded-2xl bg-white p-6 text-center text-slate-400 shadow">{t('branches.noBranches')}</p>
        )}
      </div>
    </div>
  );
}
