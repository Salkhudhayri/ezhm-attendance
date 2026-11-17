import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useLang } from '../context/LanguageContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import LanguageToggle from './LanguageToggle.jsx';
import Logo from './Logo.jsx';

export default function AdminLayout() {
  const { t } = useLang();
  const { username, logout } = useAuth();
  const navigate = useNavigate();

  const links = [
    { to: '/admin', label: t('admin.dashboard'), end: true },
    { to: '/admin/employees', label: t('admin.employees') },
    { to: '/admin/records', label: t('admin.records') },
    { to: '/admin/reports', label: t('admin.reports') },
    { to: '/admin/branches', label: t('admin.branches') },
    { to: '/admin/password', label: t('admin.changePassword') },
  ];

  function handleLogout() {
    logout();
    navigate('/admin/login');
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <Logo className="h-9" />
            <span className="whitespace-nowrap text-xl font-bold text-slate-800">{t('appName')}</span>
          </div>
          <nav className="flex flex-wrap gap-1">
            {links.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `rounded-lg px-4 py-2 text-sm font-semibold ${
                    isActive ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          {username && <span className="text-sm text-slate-500">{username}</span>}
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-300"
          >
            {t('common.logout')}
          </button>
        </div>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
