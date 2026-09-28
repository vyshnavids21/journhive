// Formats a trip's start/end into a compact range, e.g. "Sep 1 – 8, 2026" or "Dec 28, 2025 – Jan 3, 2026".
// Falls back to the raw values if the dates can't be parsed.
export function formatDateRange(start: unknown, end: unknown): string {
  const s = toDate(start);
  const e = toDate(end);
  if (!s && !e) {
    return [start, end].filter(Boolean).join(' – ') || 'Dates not set';
  }
  if (!s || !e) {
    return format(s || e!, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  if (sameMonth && s.getDate() === e.getDate()) {
    return format(s, { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (sameMonth) {
    return `${format(s, { month: 'short', day: 'numeric' })} – ${e.getDate()}, ${e.getFullYear()}`;
  }
  if (sameYear) {
    return `${format(s, { month: 'short', day: 'numeric' })} – ${format(e, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return `${format(s, { month: 'short', day: 'numeric', year: 'numeric' })} – ${format(e, { month: 'short', day: 'numeric', year: 'numeric' })}`;
}

function toDate(value: unknown): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value as string);
  return isNaN(date.getTime()) ? null : date;
}

function format(date: Date, options: Intl.DateTimeFormatOptions): string {
  return date.toLocaleDateString('en-US', options);
}
