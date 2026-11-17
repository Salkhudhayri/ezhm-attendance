import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useLang } from '../context/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../utils/api.js';
import LanguageToggle from '../components/LanguageToggle.jsx';
import Logo from '../components/Logo.jsx';

export default function AdminLogin() {
  const { t } = useLang();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError(t('common.required'));
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.post('/auth/login', { username: username.trim(), password });
      login(result.token, result.username);
      navigate('/admin');
    } catch (err) {
      setError(err.status === 401 ? t('admin.invalidLogin') : err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4">
      <div className="absolute right-6 top-6">
        <LanguageToggle />
      </div>
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-lg">
        <div className="mb-4 flex justify-center">
          <Logo className="h-14" />
        </div>
        <h1 className="mb-6 text-center text-2xl font-bold text-slate-800">{t('admin.loginTitle')}</h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">{t('admin.username')}</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-lg"
              autoComplete="username"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-slate-600">{t('admin.password')}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-4 py-3 text-lg"
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm font-semibold text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 min-h-[56px] rounded-lg bg-blue-600 text-lg font-bold text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {t('admin.login')}
          </button>
        </form>
        <Link to="/" className="mt-6 block text-center text-sm text-slate-500 underline">
          {t('common.back')} {t('common.kiosk')}
        </Link>
      </div>
    </div>
  );
}
