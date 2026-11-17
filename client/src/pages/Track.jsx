import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext.jsx';
import { api } from '../utils/api.js';
import PinPad from '../components/PinPad.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import Logo from '../components/Logo.jsx';
import BranchPicker from '../components/BranchPicker.jsx';

const CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

// An employee's own phone keeps returning to the same branch, so remember it
// and drop them straight onto the name list next time.
const BRANCH_STORAGE_KEY = 'trackBranchId';

export default function Track() {
  const { t, lang } = useLang();
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(() => localStorage.getItem(BRANCH_STORAGE_KEY) || '');
  const [branchesLoaded, setBranchesLoaded] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [screen, setScreen] = useState(() =>
    localStorage.getItem(BRANCH_STORAGE_KEY) ? 'select' : 'branch'
  ); // branch | select | pin | tracking
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [lastCheck, setLastCheck] = useState(null); // { withinZone, distanceMeters, branch, time }
  const intervalRef = useRef(null);

  useEffect(() => {
    api
      .get('/branches')
      .then((raw) => {
        const list = Array.isArray(raw) ? raw : [];
        setBranches(list);
        // Forget a remembered branch that no longer exists.
        if (branchId && !list.some((b) => String(b.id) === String(branchId))) {
          localStorage.removeItem(BRANCH_STORAGE_KEY);
          setBranchId('');
          setScreen('branch');
        }
      })
      .catch(() => setError(t('kiosk.errorGeneric')))
      .finally(() => setBranchesLoaded(true));
    return () => stopTracking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!branchId) {
      setEmployees([]);
      return;
    }
    api
      .get(`/employees?branch_id=${branchId}`)
      .then((list) => setEmployees(Array.isArray(list) ? list : []))
      .catch(() => setError(t('kiosk.errorGeneric')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  function stopTracking() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }

  function chooseBranch(branch) {
    localStorage.setItem(BRANCH_STORAGE_KEY, String(branch.id));
    setBranchId(String(branch.id));
    setError('');
    setScreen('select');
  }

  function selectEmployee(emp) {
    setSelectedEmployee(emp);
    setPin('');
    setError('');
    setScreen('pin');
  }

  async function handlePinChange(next) {
    setPin(next);
    if (next.length !== 4) return;
    setSubmitting(true);
    setError('');
    try {
      const status = await api.get(`/attendance/status/${selectedEmployee.id}`);
      if (status.status === 'clocked_out') {
        setError(t('track.notClockedIn'));
        setPin('');
        setSubmitting(false);
        return;
      }
      setScreen('tracking');
      startTracking();
    } catch (err) {
      setError(err.status === 401 ? t('kiosk.errorIncorrectPin') : err.message || t('kiosk.errorGeneric'));
      setPin('');
    } finally {
      setSubmitting(false);
    }
  }

  function startTracking() {
    runCheck();
    intervalRef.current = setInterval(runCheck, CHECK_INTERVAL_MS);
  }

  function runCheck() {
    if (!navigator.geolocation) {
      setError(t('track.geoNotSupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const result = await api.post('/attendance/location-check', {
            employee_id: selectedEmployee.id,
            pin,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setError('');
          setLastCheck({ ...result, time: new Date() });
        } catch (err) {
          setError(err.message || t('kiosk.errorGeneric'));
        }
      },
      (err) => setError(err.message || t('track.geoError')),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }

  function reset() {
    stopTracking();
    setScreen('select');
    setSelectedEmployee(null);
    setPin('');
    setError('');
    setLastCheck(null);
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-50 px-4 py-8">
      <div className="mb-6 flex w-full max-w-md items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo className="h-10" />
          <h1 className="text-2xl font-bold text-slate-800">{t('track.title')}</h1>
        </div>
        <LanguageToggle />
      </div>

      <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-lg">
        {screen === 'branch' && (
          <>
            <BranchPicker
              branches={branches}
              loading={!branchesLoaded}
              onSelect={chooseBranch}
              title={t('track.selectBranch')}
            />
            {error && <p className="mt-4 text-center font-semibold text-red-600">{error}</p>}
          </>
        )}

        {screen === 'select' && (
          <>
            <p className="mb-6 text-center text-slate-500">{t('track.selectPrompt')}</p>
            <div className="grid grid-cols-2 gap-3">
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => selectEmployee(emp)}
                  className="flex min-h-[90px] flex-col items-center justify-center rounded-2xl bg-blue-50 p-3 text-center shadow active:scale-95 active:bg-blue-100"
                >
                  <span className="font-bold text-slate-800">{emp.name_en}</span>
                  {emp.name_ar && <span className="text-sm text-slate-500">{emp.name_ar}</span>}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setScreen('branch')}
              className="mt-6 block w-full text-center text-sm text-slate-400 underline"
            >
              {t('kiosk.changeBranch')}
            </button>
          </>
        )}

        {screen === 'pin' && selectedEmployee && (
          <div className="text-center">
            <h2 className="mb-1 text-xl font-bold text-slate-800">
              {lang === 'ar' && selectedEmployee.name_ar ? selectedEmployee.name_ar : selectedEmployee.name_en}
            </h2>
            <p className="mb-6 text-slate-500">{t('kiosk.enterPin')}</p>
            <div className="mx-auto max-w-xs">
              <PinPad pin={pin} onChange={handlePinChange} />
            </div>
            {error && <p className="mt-4 font-semibold text-red-600">{error}</p>}
            {submitting && <p className="mt-4 text-slate-400">{t('common.loading')}</p>}
            <button type="button" onClick={reset} className="mt-6 text-slate-500 underline">
              {t('kiosk.cancel')}
            </button>
          </div>
        )}

        {screen === 'tracking' && selectedEmployee && (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">
              📍
            </div>
            <h2 className="mb-1 text-xl font-bold text-slate-800">
              {lang === 'ar' && selectedEmployee.name_ar ? selectedEmployee.name_ar : selectedEmployee.name_en}
            </h2>
            <p className="mb-4 text-sm text-slate-500">{t('track.activeHint')}</p>

            {lastCheck && (
              <div
                className={`mb-4 rounded-xl p-4 ${
                  lastCheck.withinZone ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                }`}
              >
                <p className="font-semibold">
                  {lastCheck.withinZone ? t('track.withinZone') : t('track.outsideZone')}
                </p>
                {lastCheck.branch && (
                  <p className="text-sm">
                    {t('track.atBranch', {
                      branch:
                        lang === 'ar' && lastCheck.branch.name_ar
                          ? lastCheck.branch.name_ar
                          : lastCheck.branch.name_en,
                    })}
                  </p>
                )}
                <p className="text-sm">{lastCheck.time.toLocaleTimeString()}</p>
              </div>
            )}

            {error && <p className="mb-4 font-semibold text-red-600">{error}</p>}

            <button
              type="button"
              onClick={reset}
              className="rounded-lg bg-slate-200 px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-300"
            >
              {t('track.stop')}
            </button>
          </div>
        )}
      </div>

      <Link to="/" className="mt-6 text-sm text-slate-500 underline">
        {t('common.back')} {t('common.kiosk')}
      </Link>
    </div>
  );
}
