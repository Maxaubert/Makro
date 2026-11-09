import { describe, expect, it } from 'vitest';
import type { DayStatus, WeeklyAverage, WeeklyMeasure } from '../domain/guidance';
import {
  VERDICT_LABEL,
  coverageNote,
  dayLine,
  dayStatusLine,
  leftOutNote,
  remainingText,
  weekRange,
  weeklyHeadline,
} from './guidanceCopy';

const measure = (over: Partial<WeeklyMeasure>): WeeklyMeasure => ({
  average: 20,
  days_with_value: 1,
  covered: 1,
  count: 1,
  verdict: 'on_target',
  days: [],
  ...over,
});

describe('dates', () => {
  it('writes one day with weekday and month', () => {
    expect(dayLine('2026-10-16')).toBe('Fri 16 Oct');
  });
  it('shares the month in a range inside one month', () => {
    expect(weekRange(['2026-10-12', '2026-10-13', '2026-10-16'])).toBe('Mon 12 to Fri 16 Oct');
  });
  it('names both months when the range crosses one', () => {
    expect(weekRange(['2026-09-28', '2026-09-29', '2026-10-01'])).toBe('Mon 28 Sep to Thu 1 Oct');
  });
  it('writes a single day when the window is one day', () => {
    expect(weekRange(['2026-10-12'])).toBe('Mon 12 Oct');
  });
});

describe('leftOutNote', () => {
  const week = (left_out: string[], counted: number, dates: string[]): WeeklyAverage =>
    ({ dates, counted_days: counted, left_out, measures: {} }) as WeeklyAverage;
  it('matches the canvas for one left-out day', () => {
    expect(leftOutNote(week(['2026-10-14'], 4, ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16']))).toBe(
      '4 of 5 days counted. Wed had no logged meal and is left out.',
    );
  });
  it('lists two days', () => {
    expect(leftOutNote(week(['2026-10-13', '2026-10-14'], 1, ['2026-10-12', '2026-10-13', '2026-10-14']))).toBe(
      '1 of 3 days counted. Tue and Wed had no logged meal and are left out.',
    );
  });
  it('lists three days', () => {
    expect(leftOutNote(week(['2026-10-12', '2026-10-13', '2026-10-14'], 1, ['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']))).toBe(
      '1 of 4 days counted. Mon, Tue and Wed had no logged meal and are left out.',
    );
  });
  it('says nothing about left-out days when all are counted', () => {
    expect(leftOutNote(week([], 2, ['2026-10-12', '2026-10-13']))).toBe('2 of 2 days counted.');
  });
});

describe('weeklyHeadline', () => {
  it('reads as an average when every entry has a value', () => {
    expect(weeklyHeadline(measure({ covered: 33, count: 33, average: 2240 }), 'kcal')).toEqual({ caption: 'Average per logged day', value: '2,240' });
  });
  it('reads as at least when some entries have no value', () => {
    expect(weeklyHeadline(measure({ covered: 27, count: 33, average: 16.75 }), 'fibre_g')).toEqual({ caption: 'At least, per logged day', value: '17' });
  });
  it('shows ? and never 0 when nothing is known', () => {
    expect(weeklyHeadline(measure({ covered: 0, count: 3, average: null }), 'fibre_g')).toEqual({ caption: 'No values logged', value: '?' });
  });
  it('keeps one decimal under 10 g', () => {
    expect(weeklyHeadline(measure({ average: 4.26 }), 'fat_g').value).toBe('4.3');
  });
});

describe('coverageNote', () => {
  const day = (local_date: string, covered: number, count: number) => ({ local_date, logged: count > 0, value: covered > 0 ? 1 : null, covered, count });
  it('matches the canvas when every entry is covered', () => {
    expect(coverageNote(measure({ covered: 33, count: 33 }), 'kcal')).toBe('Covers all 33 entries.');
  });
  it('matches the canvas when some are not, and names the days', () => {
    const days = [day('2026-10-12', 25, 26), day('2026-10-13', 2, 2), day('2026-10-14', 0, 0), day('2026-10-15', 0, 5)];
    expect(coverageNote(measure({ covered: 27, count: 33, days }), 'fibre_g')).toBe(
      'Covers 27 of 33 entries. The other 6 have no fibre value and are left out, not counted as 0. By day: Mon 25 of 26, Thu 0 of 5.',
    );
  });
  it('uses the singular for one entry', () => {
    expect(coverageNote(measure({ covered: 1, count: 1 }), 'kcal')).toBe('Covers the 1 entry.');
    expect(coverageNote(measure({ covered: 1, count: 2, days: [day('2026-10-12', 1, 2)] }), 'protein_g')).toBe(
      'Covers 1 of 2 entries. The other 1 has no protein value and is left out, not counted as 0. By day: Mon 1 of 2.',
    );
  });
  it('says nothing about an empty week', () => {
    expect(coverageNote(measure({ covered: 0, count: 0 }), 'kcal')).toBe('');
  });
});

describe('dayStatusLine', () => {
  const status = (over: Partial<DayStatus>): DayStatus => ({
    status: 'under',
    eaten: 1310,
    covered: 2,
    count: 2,
    difference: -1090,
    may_be_incomplete: false,
    reasons: [],
    ...over,
  });
  it('matches the canvas for an under day with the warning', () => {
    expect(dayStatusLine(status({ may_be_incomplete: true, reasons: ['few_entries'] }))).toBe('Under target, may be incomplete');
  });
  it('reads plainly without the warning', () => {
    expect(dayStatusLine(status({}))).toBe('Under target');
    expect(dayStatusLine(status({ status: 'on_target' }))).toBe('On target');
    expect(dayStatusLine(status({ status: 'over' }))).toBe('Over target');
  });
  it('says calories are unknown rather than under', () => {
    expect(dayStatusLine(status({ status: 'unknown', eaten: null, may_be_incomplete: true }))).toBe('Calories unknown, may be incomplete');
  });
  it('has no line for a day with nothing logged: it is not a fast and not under', () => {
    expect(dayStatusLine(status({ status: 'not_logged', eaten: null, count: 0 }))).toBeNull();
  });
  it('has no line without a target', () => {
    expect(dayStatusLine(status({ status: 'no_target', may_be_incomplete: true }))).toBeNull();
  });
});

describe('remainingText', () => {
  it('prints what is left', () => {
    expect(remainingText({ left: 840, exact: true }, 'kcal')).toEqual({ value: '840', over: false });
    expect(remainingText({ left: 58, exact: true }, 'protein_g')).toEqual({ value: '58 g', over: false });
  });
  it('prints the amount over as a positive number', () => {
    expect(remainingText({ left: -100, exact: true }, 'kcal')).toEqual({ value: '100', over: true });
  });
  it('marks an upper bound, and a lower bound on the amount over', () => {
    expect(remainingText({ left: 140, exact: false }, 'protein_g')).toEqual({ value: '≤ 140 g', over: false });
    expect(remainingText({ left: -20, exact: false }, 'protein_g')).toEqual({ value: '≥ 20 g', over: true });
  });
  it('shows ? and never 0 for an unknown amount', () => {
    expect(remainingText({ left: null, exact: false }, 'protein_g')).toEqual({ value: '?', over: false });
  });
});

describe('language', () => {
  it('stays neutral: no praise and no blame in any verdict or status', () => {
    const texts = [
      ...Object.values(VERDICT_LABEL),
      dayStatusLine({ status: 'under', eaten: 1, covered: 1, count: 1, difference: -1, may_be_incomplete: true, reasons: [] }),
      dayStatusLine({ status: 'over', eaten: 1, covered: 1, count: 1, difference: 1, may_be_incomplete: false, reasons: [] }),
      dayStatusLine({ status: 'on_target', eaten: 1, covered: 1, count: 1, difference: 0, may_be_incomplete: false, reasons: [] }),
    ].join(' ');
    expect(texts).not.toMatch(/great|good|well done|nice|bad|fail|missed|cheat|should|must|!/i);
  });
});
