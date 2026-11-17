import { useLang } from '../context/LanguageContext.jsx';

// Shared "which shop is this?" grid used by the kiosk and the employee
// tracking page, styled to match the employee tiles they sit in front of.
export default function BranchPicker({ branches, onSelect, title, hint, loading = false }) {
  const { t, lang } = useLang();

  // An empty list means "none set up" only once the fetch has answered;
  // before that it is just the initial state and must not look like an error.
  if (loading) {
    return <p className="text-center text-slate-400">{t('common.loading')}</p>;
  }

  if (branches.length === 0) {
    return <p className="text-center text-slate-400">{t('kiosk.noBranchesYet')}</p>;
  }

  return (
    <>
      <h2 className="mb-1 text-center text-2xl font-bold text-slate-800">{title}</h2>
      {hint && <p className="mb-6 text-center text-slate-500">{hint}</p>}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {branches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            onClick={() => onSelect(branch)}
            className="flex min-h-[110px] flex-col items-center justify-center rounded-2xl bg-slate-100 p-4 text-center shadow active:scale-95 active:bg-slate-200"
          >
            <span className="text-lg font-bold text-slate-800">
              {lang === 'ar' && branch.name_ar ? branch.name_ar : branch.name_en}
            </span>
            {lang !== 'ar' && branch.name_ar && <span className="text-base text-slate-500">{branch.name_ar}</span>}
          </button>
        ))}
      </div>
    </>
  );
}
