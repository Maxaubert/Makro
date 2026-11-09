// local_date and tz for log entries and weights (packages/contracts/log-schema.md).
// Both are fixed when the row is saved and never recomputed, so travel and daylight
// saving cannot move an entry to another day.

/** The browser's IANA time zone, for example Europe/Oslo. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The calendar day (YYYY-MM-DD) that `at` falls on in `timeZone`. */
export function localDateIn(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => {
    const p = parts.find((x) => x.type === type);
    if (!p) throw new Error(`Intl gave no ${type} for ${timeZone}`);
    return p.value;
  };
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Minutes after midnight in `timeZone`, from a stored timestamp. null when it does not parse. */
export function localMinutes(at: string, timeZone: string): number | null {
  const t = new Date(at);
  if (Number.isNaN(t.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(t);
  const get = (type: string) => Number(parts.find((x) => x.type === type)?.value);
  return get('hour') * 60 + get('minute');
}

/** The instant that is `minutes` after local midnight of `localDate` in `timeZone`. */
export function instantOn(localDate: string, minutes: number, timeZone: string): Date {
  const [y, m, d] = localDate.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, minutes);
  let at = new Date(wall);
  // The zone's offset depends on the instant, so correct by what the clock shows, twice for DST.
  for (let i = 0; i < 2; i++) {
    const [sy, sm, sd] = localDateIn(at, timeZone).split('-').map(Number);
    const shown = Date.UTC(sy, sm - 1, sd, 0, localMinutes(at.toISOString(), timeZone) as number);
    at = new Date(at.getTime() + wall - shown);
  }
  return at;
}

/** `value` when it is a real YYYY-MM-DD day before `today`, otherwise null. Input from a URL. */
export function pastLocalDate(value: string | null, today: string): string | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value >= today) return null;
  const [y, m, d] = value.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) === value ? value : null;
}

export interface LocalDay {
  tz: string;
  local_date: string;
}

/** Stamp a row being saved now (or at `at`) with its zone and the day it counts toward. */
export function stampLocalDay(at: Date = new Date(), timeZone: string = browserTimeZone()): LocalDay {
  return { tz: timeZone, local_date: localDateIn(at, timeZone) };
}
