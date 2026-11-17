// Riyadh is fixed UTC+3 year-round (no DST), so plain offset math is safe here.
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

// Formats a UTC ISO string for an <input type="datetime-local"> value, using
// Riyadh wall-clock time regardless of the browser's own timezone.
export function formatForDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + RIYADH_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes()
  )}`;
}

// Parses an <input type="datetime-local"> value (treated as Riyadh wall-clock time) into a UTC ISO string.
export function toIsoFromRiyadhLocal(value) {
  if (!value) return null;
  const [datePart, timePart] = value.split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [h, mi] = timePart.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, h, mi) - RIYADH_OFFSET_MS).toISOString();
}

// 12-hour Riyadh display, e.g. "Jul 19, 2026, 3:45 PM"
export function formatDisplay(iso) {
  if (!iso) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Riyadh',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}
