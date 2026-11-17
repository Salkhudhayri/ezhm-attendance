import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import en from '../i18n/en.json';
import ar from '../i18n/ar.json';

const DICTS = { en, ar };
const LanguageContext = createContext(null);

function lookup(dict, path) {
  return path.split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), dict);
}

function interpolate(str, vars) {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => (vars[key] !== undefined ? vars[key] : `{{${key}}}`));
}

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('lang') || 'en');

  useEffect(() => {
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }, [lang]);

  const value = useMemo(() => {
    const dict = DICTS[lang] || DICTS.en;
    const t = (path, vars) => {
      const raw = lookup(dict, path) ?? lookup(DICTS.en, path) ?? path;
      return interpolate(raw, vars);
    };
    return {
      lang,
      setLang,
      toggleLang: () => setLang((l) => (l === 'en' ? 'ar' : 'en')),
      dir: lang === 'ar' ? 'rtl' : 'ltr',
      t,
    };
  }, [lang]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLang() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLang must be used within LanguageProvider');
  return ctx;
}
