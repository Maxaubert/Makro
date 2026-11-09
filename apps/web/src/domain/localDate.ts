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

export interface LocalDay {
  tz: string;
  local_date: string;
}

/** Stamp a row being saved now (or at `at`) with its zone and the day it counts toward. */
export function stampLocalDay(at: Date = new Date(), timeZone: string = browserTimeZone()): LocalDay {
  return { tz: timeZone, local_date: localDateIn(at, timeZone) };
}
