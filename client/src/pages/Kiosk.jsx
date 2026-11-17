import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '../context/LanguageContext.jsx';
import { api } from '../utils/api.js';
import PinPad from '../components/PinPad.jsx';
import LanguageToggle from '../components/LanguageToggle.jsx';
import Logo from '../components/Logo.jsx';
import BranchPicker from '../components/BranchPicker.jsx';

// Each shop's kiosk device is tied to one branch, remembered here so staff
// don't re-pick the location on every shift.
const BRANCH_STORAGE_KEY = 'kioskBranchId';

const ACTION_ENDPOINTS = {
  'clock-in': '/attendance/clock-in',
  'clock-out': '/attendance/clock-out',
  'break-start': '/attendance/break-start',
  'break-end': '/attendance/break-end',
};

const IDLE_RESET_MS = 25000;

export default function Kiosk() {
  const { t, lang } = useLang();
  const [branches, setBranches] = useState([]);
  const [branchId, setBranchId] = useState(() => localStorage.getItem(BRANCH_STORAGE_KEY) || '');
  const [branchesLoaded, setBranchesLoaded] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [employeesLoaded, setEmployeesLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [screen, setScreen] = useState('grid'); // grid | action | pin | confirm
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [status, setStatus] = useState(null);
  const [selectedAction, setSelectedAction] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    api
      .get('/branches')
      .then((raw) => {
        const list = Array.isArray(raw) ? raw : [];
        setBranches(list);
        // A branch remembered on this device that no longer exists (renamed
        // away, deleted) would otherwise show an empty, unexplained grid.
        setBranchId((current) => {
          if (current && !list.some((b) => String(b.id) === String(current))) {
            localStorage.removeItem(BRANCH_STORAGE_KEY);
            return '';
          }
          return current;
        });
      })
      .catch(() => setLoadError(t('kiosk.errorGeneric')))
      .finally(() => setBranchesLoaded(true));
  }, []);

  useEffect(() => {
    if (!branchId) {
      setEmployees([]);
      setEmployeesLoaded(false);
      return;
    }
    loadEmployees(branchId);
  }, [branchId]);

  function loadEmployees(id) {
    api
      .get(`/employees?branch_id=${id}`)
      .then((list) => {
        setEmployees(Array.isArray(list) ? list : []);
        setEmployeesLoaded(true);
      })
      .catch(() => setLoadError(t('kiosk.errorGeneric')));
  }

  function chooseBranch(branch) {
    localStorage.setItem(BRANCH_STORAGE_KEY, String(branch.id));
    setBranchId(String(branch.id));
    resetToGrid();
  }

  function clearBranch() {
    localStorage.removeItem(BRANCH_STORAGE_KEY);
    setBranchId('');
    resetToGrid();
  }

  const selectedBranch = branches.find((b) => String(b.id) === String(branchId)) || null;
  const branchLabel = selectedBranch
    ? lang === 'ar' && selectedBranch.name_ar
      ? selectedBranch.name_ar
      : selectedBranch.name_en
    : '';

  function resetToGrid() {
    setScreen('grid');
    setSelectedEmployee(null);
    setStatus(null);
    setSelectedAction(null);
    setPin('');
    setError('');
    setConfirmation(null);
  }

  // Idle timeout: bounce back to the employee grid if a screen sits untouched
  useEffect(() => {
    if (screen === 'grid' || screen === 'confirm') return undefined;
    const timer = setTimeout(resetToGrid, IDLE_RESET_MS);
    return () => clearTimeout(timer);
  }, [screen, pin, selectedAction]);

  async function selectEmployee(emp) {
    setSelectedEmployee(emp);
    setError('');
    try {
      const s = await api.get(`/attendance/status/${emp.id}`);
      setStatus(s.status);
      if (s.status === 'clocked_out') {
        setSelectedAction('clock-in');
        setScreen('pin');
      } else if (s.status === 'on_break') {
        setSelectedAction('break-end');
        setScreen('pin');
      } else {
        setScreen('action');
      }
    } catch {
      setError(t('kiosk.errorGeneric'));
      setScreen('grid');
    }
  }

  function chooseAction(action) {
    setSelectedAction(action);
    setPin('');
    setError('');
    setScreen('pin');
  }

  async function submitPin(fullPin) {
    setSubmitting(true);
    setError('');
    try {
      const result = await api.post(ACTION_ENDPOINTS[selectedAction], {
        employee_id: selectedEmployee.id,
        pin: fullPin,
      });
      setConfirmation({ message: successMessage(selectedAction), time: result.time });
      setScreen('confirm');
      setTimeout(resetToGrid, 3000);
    } catch (err) {
      setPin('');
      setError(err.status === 401 ? t('kiosk.errorIncorrectPin') : err.message || t('kiosk.errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  }

  function successMessage(action) {
    switch (action) {
      case 'clock-in':
        return t('kiosk.successClockIn');
      case 'clock-out':
        return t('kiosk.successClockOut');
      case 'break-start':
        return t('kiosk.successBreakStart');
      case 'break-end':
        return t('kiosk.successBreakEnd');
      default:
        return '';
    }
  }

  function handlePinChange(next) {
    setPin(next);
    if (next.length === 4) submitPin(next);
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-50 px-4 py-8">
      <div className="mb-6 flex w-full max-w-4xl flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Logo className="h-14" />
          <div>
            <h1 className="text-3xl font-bold text-slate-800">{t('appName')}</h1>
            {branchLabel && (
              <p className="mt-1 text-slate-500">
                {branchLabel}
                <button type="button" onClick={clearBranch} className="ms-3 text-sm text-slate-400 underline">
                  {t('kiosk.changeBranch')}
                </button>
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <Link
            to="/track"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
          >
            {t('kiosk.trackLink')}
          </Link>
          <Link
            to="/admin/login"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-500 hover:bg-slate-100"
          >
            {t('kiosk.adminLogin')}
          </Link>
        </div>
      </div>

      <div className="w-full max-w-4xl rounded-3xl bg-white p-8 shadow-lg">
        {!branchId && (
          <>
            <BranchPicker
              branches={branches}
              loading={!branchesLoaded}
              onSelect={chooseBranch}
              title={t('kiosk.selectBranch')}
              hint={t('kiosk.selectBranchHint')}
            />
            {loadError && <p className="mt-4 text-center text-red-600">{loadError}</p>}
          </>
        )}

        {branchId && screen === 'grid' && (
          <>
            <h2 className="mb-1 text-center text-2xl font-bold text-slate-800">{t('kiosk.selectYourName')}</h2>
            <p className="mb-6 text-center text-slate-500">{t('kiosk.welcome')}</p>
            {loadError && <p className="mb-4 text-center text-red-600">{loadError}</p>}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {employees.map((emp) => (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => selectEmployee(emp)}
                  className="flex min-h-[110px] flex-col items-center justify-center rounded-2xl bg-blue-50 p-4 text-center shadow active:scale-95 active:bg-blue-100"
                >
                  <span className="text-lg font-bold text-slate-800">{emp.name_en}</span>
                  {emp.name_ar && <span className="text-base text-slate-500">{emp.name_ar}</span>}
                </button>
              ))}
            </div>
            {!loadError && employees.length === 0 && (
              <p className="text-center text-slate-400">
                {employeesLoaded ? t('employees.noEmployees') : t('common.loading')}
              </p>
            )}
          </>
        )}

        {screen === 'action' && selectedEmployee && (
          <div className="text-center">
            <h2 className="mb-2 text-2xl font-bold text-slate-800">
              {lang === 'ar' && selectedEmployee.name_ar ? selectedEmployee.name_ar : selectedEmployee.name_en}
            </h2>
            <p className="mb-6 text-slate-500">{t('kiosk.statusClockedIn')}</p>
            <div className="mx-auto flex max-w-sm flex-col gap-4">
              <button
                type="button"
                onClick={() => chooseAction('clock-out')}
                className="min-h-[80px] rounded-2xl bg-red-500 text-2xl font-bold text-white shadow active:scale-95"
              >
                {t('kiosk.clockOut')}
              </button>
              <button
                type="button"
                onClick={() => chooseAction('break-start')}
                className="min-h-[80px] rounded-2xl bg-amber-500 text-2xl font-bold text-white shadow active:scale-95"
              >
                {t('kiosk.startBreak')}
              </button>
              <button type="button" onClick={resetToGrid} className="mt-2 text-slate-500 underline">
                {t('kiosk.cancel')}
              </button>
            </div>
          </div>
        )}

        {screen === 'pin' && selectedEmployee && (
          <div className="text-center">
            <h2 className="mb-1 text-2xl font-bold text-slate-800">
              {lang === 'ar' && selectedEmployee.name_ar ? selectedEmployee.name_ar : selectedEmployee.name_en}
            </h2>
            <p className="mb-6 text-slate-500">{t('kiosk.enterPin')}</p>
            <div className="mx-auto max-w-xs">
              <PinPad pin={pin} onChange={handlePinChange} />
            </div>
            {error && <p className="mt-4 font-semibold text-red-600">{error}</p>}
            {submitting && <p className="mt-4 text-slate-400">{t('common.loading')}</p>}
            <button type="button" onClick={resetToGrid} className="mt-6 text-slate-500 underline">
              {t('kiosk.cancel')}
            </button>
          </div>
        )}

        {screen === 'confirm' && confirmation && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-4xl text-green-600">
              ✓
            </div>
            <h2 className="mb-2 text-2xl font-bold text-slate-800">{confirmation.message}</h2>
            <p className="text-lg text-slate-500">
              {lang === 'ar' && selectedEmployee?.name_ar ? selectedEmployee.name_ar : selectedEmployee?.name_en}
            </p>
            <p className="text-lg text-slate-500">{confirmation.time}</p>
          </div>
        )}
      </div>
    </div>
  );
}
