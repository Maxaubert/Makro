import { describe, expect, it } from 'vitest';
import { browserTimeZone, instantOn, localDateIn, localMinutes, pastLocalDate, stampLocalDay } from './localDate';

describe('instantOn', () => {
  it.each([
    ['2026-07-14', 18 * 60 + 30, 'Europe/Oslo', '2026-07-14T16:30:00.000Z'],
    ['2026-01-14', 18 * 60 + 30, 'Europe/Oslo', '2026-01-14T17:30:00.000Z'],
    ['2026-01-14', 8 * 60, 'America/New_York', '2026-01-14T13:00:00.000Z'],
    ['2026-03-29', 12 * 60, 'Europe/Oslo', '2026-03-29T10:00:00.000Z'],
    ['2026-01-14', 8 * 60, 'Pacific/Kiritimati', '2026-01-13T18:00:00.000Z'],
  ])('finds %s + %d min in %s', (date, minutes, tz, iso) => {
    const at = instantOn(date, minutes, tz);
    expect(at.toISOString()).toBe(iso);
    expect(localDateIn(at, tz)).toBe(date);
    expect(localMinutes(at.toISOString(), tz)).toBe(minutes);
  });
});

describe('pastLocalDate', () => {
  it('accepts a day before today', () => {
    expect(pastLocalDate('2026-11-08', '2026-11-09')).toBe('2026-11-08');
  });
  it.each([[null], [''], ['2026-11-09'], ['2026-11-10'], ['yesterday'], ['2026-13-01'], ['2026-02-31']])('refuses %s', (value) => {
    expect(pastLocalDate(value, '2026-11-09')).toBeNull();
  });
});

describe('localMinutes', () => {
  it('gives minutes after local midnight in the stored zone', () => {
    // 11:10 UTC on 16 Oct is 13:10 in Oslo (UTC+2, summer time).
    expect(localMinutes('2026-10-16T11:10:00.000Z', 'Europe/Oslo')).toBe(790);
    expect(localMinutes('2026-10-16T11:10:00.000Z', 'UTC')).toBe(670);
  });
  it('gives 0 at midnight, not 1440', () => {
    expect(localMinutes('2026-10-16T00:00:00.000Z', 'UTC')).toBe(0);
  });
  it('is unknown for a time that does not parse', () => {
    expect(localMinutes('not a time', 'UTC')).toBeNull();
  });
});

describe('local_date and tz', () => {
  it('gives the day in the given zone, not in UTC', () => {
    // 23:30 UTC on 20 Oct is 01:30 on 21 Oct in Oslo (UTC+2, summer time).
    const t = new Date('2026-10-20T23:30:00.000Z');
    expect(localDateIn(t, 'Europe/Oslo')).toBe('2026-10-21');
    expect(localDateIn(t, 'UTC')).toBe('2026-10-20');
    expect(localDateIn(t, 'America/New_York')).toBe('2026-10-20');
  });

  it('follows daylight saving changes', () => {
    // Oslo leaves summer time on 25 Oct 2026 at 01:00 UTC. 23:30 UTC on 25 Oct is then 00:30 on 26 Oct (UTC+1).
    expect(localDateIn(new Date('2026-10-25T23:30:00.000Z'), 'Europe/Oslo')).toBe('2026-10-26');
    // 22:30 UTC on 25 Oct is 23:30 the same day in winter time.
    expect(localDateIn(new Date('2026-10-25T22:30:00.000Z'), 'Europe/Oslo')).toBe('2026-10-25');
  });

  it('pads month and day to YYYY-MM-DD', () => {
    expect(localDateIn(new Date('2026-01-05T12:00:00.000Z'), 'Europe/Oslo')).toBe('2026-01-05');
  });

  it('reads the IANA zone from Intl', () => {
    const tz = browserTimeZone();
    expect(tz).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(tz.length).toBeGreaterThan(0);
  });

  it('stamps both fields together, fixed at save time', () => {
    const t = new Date('2026-10-20T23:30:00.000Z');
    expect(stampLocalDay(t, 'Europe/Oslo')).toEqual({ tz: 'Europe/Oslo', local_date: '2026-10-21' });
    const now = stampLocalDay();
    expect(now.tz).toBe(browserTimeZone());
    expect(now.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
