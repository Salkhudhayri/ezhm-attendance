import { useLang } from '../context/LanguageContext.jsx';

export default function LanguageToggle({ className = '' }) {
  const { lang, toggleLang } = useLang();
  return (
    <button
      type="button"
      onClick={toggleLang}
      className={`rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 ${className}`}
    >
      {lang === 'en' ? 'العربية' : 'English'}
    </button>
  );
}
