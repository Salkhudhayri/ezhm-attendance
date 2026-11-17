import { useState } from 'react';
import { useLang } from '../context/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../utils/api.js';

const EMPTY_FORM = { currentPassword: '', newPassword: '', confirmPassword: '' };

export default function ChangePassword() {
  const { t } = useLang();
  const { username, login } = useAuth();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (form.newPassword !== form.confirmPassword) {
      setError(t('password.mismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post(
        '/auth/change-password',
        { currentPassword: form.currentPassword, newPassword: form.newPassword },
        { auth: true }
      );
      // The server reissues a token so this session isn't logged out mid-change.
      if (result.token) login(result.token, result.username);
      setForm(EMPTY_FORM);
      setSuccess(t('password.saved'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <h1 className="mb-2 text-2xl font-bold text-slate-800">{t('password.title')}</h1>
      <p className="mb-6 text-slate-500">{t('password.description', { username: username || '' })}</p>

      <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow">
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t('password.current')} <span className="text-red-500">*</span>
            </label>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t('password.new')} <span className="text-red-500">*</span>
            </label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              required
            />
            <p className="mt-1 text-xs text-slate-400">{t('password.hint')}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">
              {t('password.confirm')} <span className="text-red-500">*</span>
            </label>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              required
            />
          </div>
        </div>

        {error && <p className="mt-4 font-semibold text-red-600">{error}</p>}
        {success && <p className="mt-4 font-semibold text-green-600">{success}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="mt-5 rounded-lg bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? t('common.loading') : t('password.submit')}
        </button>
      </form>

      <p className="mt-4 text-sm text-slate-400">{t('password.note')}</p>
    </div>
  );
}
