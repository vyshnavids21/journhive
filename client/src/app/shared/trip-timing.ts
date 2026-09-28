// Where a trip sits in time relative to today: status, length and a human hint ("Starts in 12 days").

export type TripStatus = 'upcoming' | 'ongoing' | 'completed';

export interface TripTiming {
  status: TripStatus;
  /** Inclusive length in days (0 if the dates are missing or invalid) */
  days: number;
  /** Start of the first day, in ms (0 if unknown) — handy for sorting */
  startTime: number;
  /** e.g. "Starts in 12 days", "Day 3 of 6", "3 months ago" */
  when: string;
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function tripTiming(startDate: unknown, endDate: unknown, now = Date.now()): TripTiming {
  const start = dayStart(startDate);
  const end = dayStart(endDate) || start;
  const today = dayStart(now);

  let status: TripStatus = 'completed';
  if (start && start > today) {
    status = 'upcoming';
  } else if (start && start <= today && end + DAY_MS > today) {
    status = 'ongoing';
  }

  const days = start && end >= start ? Math.round((end - start) / DAY_MS) + 1 : 0;
  return { status, days, startTime: start, when: relative(status, start, end, today, days) };
}

export function statusLabel(status: TripStatus): string {
  return status === 'upcoming' ? 'Upcoming' : status === 'ongoing' ? 'Happening now' : 'Completed';
}

/** Midnight (local) of the given date, in ms; 0 if it can't be parsed. */
export function dayStart(value: unknown): number {
  if (!value && value !== 0) {
    return 0;
  }
  const d = value instanceof Date ? new Date(value.getTime()) : new Date(value as string | number);
  if (isNaN(d.getTime())) {
    return 0;
  }
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function relative(status: TripStatus, start: number, end: number, today: number, days: number): string {
  if (!start) {
    return '';
  }
  if (status === 'upcoming') {
    const n = Math.round((start - today) / DAY_MS);
    return n === 1 ? 'Starts tomorrow' : n < 60 ? `Starts in ${n} days` : `Starts in ${Math.round(n / 30)} months`;
  }
  if (status === 'ongoing') {
    return `Day ${Math.round((today - start) / DAY_MS) + 1} of ${days}`;
  }
  const n = Math.round((today - end) / DAY_MS);
  if (n < 1) return 'Ended today';
  if (n < 30) return n === 1 ? 'Ended yesterday' : `${n} days ago`;
  const months = Math.round(n / 30);
  if (n < 365) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.round(n / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}
