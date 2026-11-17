const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];

export default function PinPad({ pin, onChange, maxLength = 4 }) {
  function press(key) {
    if (key === 'clear') return onChange('');
    if (key === 'back') return onChange(pin.slice(0, -1));
    if (pin.length < maxLength) onChange(pin + key);
  }

  return (
    <div>
      <div className="mb-6 flex justify-center gap-4" dir="ltr">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={`h-5 w-5 rounded-full border-2 border-blue-500 ${
              i < pin.length ? 'bg-blue-500' : 'bg-transparent'
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3" dir="ltr">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            className="h-20 rounded-2xl bg-white text-3xl font-semibold text-slate-700 shadow active:scale-95 active:bg-slate-100"
          >
            {key === 'clear' ? 'C' : key === 'back' ? '⌫' : key}
          </button>
        ))}
      </div>
    </div>
  );
}
