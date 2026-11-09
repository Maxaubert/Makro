import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { expectClose, loadGolden, requireKeys } from './golden';
import {
  GUIDANCE_CONSTANTS,
  dayStatus,
  remainingToday,
  suggestFoods,
  weekWindow,
  weeklyAverage,
  weeklyVerdict,
  type DayStatus,
  type DayStatusInput,
  type HistoryCandidate,
  type RemainingValue,
  type VerifiedCandidate,
  type WeeklyAverage,
  type WeeklyInput,
} from './guidance';
import type { NutrientTotal } from './totals';

describe('guidance/constants.json', () => {
  it('matches the numbers the app uses', () => {
    const path = fileURLToPath(new URL('../../../../packages/contracts/guidance/constants.json', import.meta.url));
    const file = JSON.parse(readFileSync(path, 'utf8')) as { values: Record<string, { value: number }> };
    expect(Object.fromEntries(Object.entries(file.values).map(([k, v]) => [k, v.value]))).toEqual(GUIDANCE_CONSTANTS);
  });
});

describe('guidance/week_window.json', () => {
  const golden = loadGolden<{ today: string }, { dates: string[] }>('guidance/week_window.json');
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(weekWindow(c.input.today)).toEqual(c.expected.dates);
  });
});

describe('guidance/verdict.json', () => {
  const golden = loadGolden<{ average: number | null; target: number | null }, { verdict: string | null }>('guidance/verdict.json');
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(weeklyVerdict(c.input.average, c.input.target)).toBe(c.expected.verdict);
  });
});

describe('guidance/weekly.json', () => {
  const golden = loadGolden<WeeklyInput, WeeklyAverage>('guidance/weekly.json');
  const nutrients = golden.nutrients ?? [];
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    c.input.days.forEach((d) => d.items.forEach((item, i) => requireKeys(item, nutrients, `${id} ${d.local_date} item ${i}`)));
    requireKeys(c.expected.measures, nutrients, `${id} measures`);
    const actual = weeklyAverage(c.input, nutrients);
    expect(actual.dates, `${id} dates`).toEqual(c.expected.dates);
    expect(actual.counted_days, `${id} counted_days`).toBe(c.expected.counted_days);
    expect(actual.left_out, `${id} left_out`).toEqual(c.expected.left_out);
    for (const n of nutrients) {
      const a = actual.measures[n];
      const e = c.expected.measures[n];
      expectClose(a.average, e.average, `${id} ${n} average`);
      expect(a.days_with_value, `${id} ${n} days_with_value`).toBe(e.days_with_value);
      expect(a.covered, `${id} ${n} covered`).toBe(e.covered);
      expect(a.count, `${id} ${n} count`).toBe(e.count);
      expect(a.verdict, `${id} ${n} verdict`).toBe(e.verdict);
      expect(a.days.length, `${id} ${n} days`).toBe(e.days.length);
      e.days.forEach((day, i) => {
        expect(a.days[i].local_date, `${id} ${n} day ${i}`).toBe(day.local_date);
        expect(a.days[i].logged, `${id} ${n} day ${i} logged`).toBe(day.logged);
        expectClose(a.days[i].value, day.value, `${id} ${n} day ${i} value`);
        expect(a.days[i].covered, `${id} ${n} day ${i} covered`).toBe(day.covered);
        expect(a.days[i].count, `${id} ${n} day ${i} count`).toBe(day.count);
      });
    }
  });
});

describe('guidance/remaining.json', () => {
  const golden = loadGolden<
    { totals: Record<string, NutrientTotal>; targets: Record<string, number | null> },
    Record<string, RemainingValue>
  >('guidance/remaining.json');
  const nutrients = golden.nutrients ?? [];
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    requireKeys(c.input.totals, nutrients, `${id} totals`);
    requireKeys(c.expected, nutrients, `${id} expected`);
    const actual = remainingToday(c.input.totals, c.input.targets, nutrients);
    for (const n of nutrients) {
      expectClose(actual[n].left, c.expected[n].left, `${id} ${n} left`);
      expect(actual[n].exact, `${id} ${n} exact`).toBe(c.expected[n].exact);
    }
  });
});

describe('guidance/day_status.json', () => {
  const golden = loadGolden<DayStatusInput, DayStatus>('guidance/day_status.json');
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    const actual = dayStatus(c.input);
    expect(actual.status, `${id} status`).toBe(c.expected.status);
    expectClose(actual.eaten, c.expected.eaten, `${id} eaten`);
    expect(actual.covered, `${id} covered`).toBe(c.expected.covered);
    expect(actual.count, `${id} count`).toBe(c.expected.count);
    expectClose(actual.difference, c.expected.difference, `${id} difference`);
    expect(actual.may_be_incomplete, `${id} may_be_incomplete`).toBe(c.expected.may_be_incomplete);
    expect(actual.reasons, `${id} reasons`).toEqual(c.expected.reasons);
  });
});

describe('guidance/suggestions.json', () => {
  const golden = loadGolden<
    { left: Record<'kcal' | 'protein_g' | 'carbs_g' | 'fat_g', number | null>; history: HistoryCandidate[]; verified: VerifiedCandidate[] },
    { ids: string[] }
  >('guidance/suggestions.json');
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(suggestFoods(c.input.left, c.input.history, c.input.verified).map((s) => s.id)).toEqual(c.expected.ids);
  });

  it('keeps the tier and the whole candidate', () => {
    const left = { kcal: 500, protein_g: 50, carbs_g: 50, fat_g: 50 };
    const h = { id: 'h', kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1, uses: 1, last_eaten_at: '2026-10-16T08:00:00.000Z', name: 'Skyr' };
    const v = { id: 'v', kcal: 100, protein_g: 1, carbs_g: 1, fat_g: 1, name: 'Tuna' };
    expect(suggestFoods(left, [h], [v])).toEqual([
      { ...h, tier: 'history' },
      { ...v, tier: 'verified' },
    ]);
  });
});
