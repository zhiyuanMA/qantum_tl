import type { Instant, ISODate } from './types';

const DAY_MS = 86_400_000;
const toUtc = (date: ISODate) => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (time: number): ISODate => new Date(time).toISOString().slice(0, 10);

/** The calendar date of an instant in a time zone. */
export function dateInZone(instant: Instant, timeZone: string): ISODate {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(instant));
}

export const addDays = (date: ISODate, days: number): ISODate => fromUtc(toUtc(date) + days * DAY_MS);

export const isWeekend = (date: ISODate) => [0, 6].includes(new Date(toUtc(date)).getUTCDay());

/** Moves forward by working days. Offset zero keeps the date as given. */
export function addBusinessDays(date: ISODate, days: number): ISODate {
  let current = date;
  for (let moved = 0; moved < days; ) {
    current = addDays(current, 1);
    if (!isWeekend(current)) moved += 1;
  }
  return current;
}

export const isWithinHorizon = (date: ISODate, today: ISODate, horizonDays: number): boolean =>
  date >= today && date <= addDays(today, horizonDays);

export const hoursBetween = (from: Instant, to: Instant): number => (Date.parse(to) - Date.parse(from)) / 3_600_000;

export const daysBetween = (from: ISODate, to: ISODate): number => Math.round((toUtc(to) - toUtc(from)) / DAY_MS);

/** The Monday of the week containing a date. */
export function startOfWeek(date: ISODate): ISODate {
  const day = new Date(toUtc(date)).getUTCDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}
