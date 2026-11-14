import { describe, expect, it } from 'vitest';
import { expectClose, loadGolden, requireKeys } from './golden';
import type { NutrientValues } from './portion';
import { TREND_MEASURES, trendsSummary, type TrendBand, type TrendRange } from './trends';
import { trendChange, type WeightPoint } from './weight';

interface Expected {
  total_days: number;
  logged_days: number;
  measures: Record<string, { average: number | null; days_with_value: number; covered: number; count: number }>;
  difference: number | null;
  days_on_target: number | null;
  days_judged: number;
  highest: { local_date: string; kcal: number } | null;
  lowest: { local_date: string; kcal: number } | null;
  bar_count: number;
  bars: { from: string; to: string; value: number; band: TrendBand | null }[];
  top: number;
  weekdays: { average: number | null; days: number; over: boolean }[];
}

const golden = loadGolden<
  { today: string; range: TrendRange; targets: Record<string, number | null>; days: { local_date: string; items: NutrientValues[] }[] },
  Expected
>('guidance/trends.json');

const change = loadGolden<{ entries: WeightPoint[]; to: string; days: number }, { change_kg: number | null }>('weight/change.json');

describe('guidance/trends.json', () => {
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    requireKeys(c.input.targets, golden.nutrients as string[], `${id} targets`);
    for (const day of c.input.days) for (const item of day.items) requireKeys(item, golden.nutrients as string[], `${id} ${day.local_date}`);
    const e = c.expected;
    const a = trendsSummary(c.input);

    expect(a.window.dates.length, `${id} total_days`).toBe(e.total_days);
    expect(a.window.counted_days, `${id} logged_days`).toBe(e.logged_days);
    for (const m of TREND_MEASURES) {
      const am = a.window.measures[m];
      expectClose(am.average, e.measures[m].average, `${id} ${m} average`);
      expect([am.days_with_value, am.covered, am.count], `${id} ${m} coverage`).toEqual([e.measures[m].days_with_value, e.measures[m].covered, e.measures[m].count]);
    }
    expectClose(a.difference, e.difference, `${id} difference`);
    expect(a.days_on_target, `${id} days_on_target`).toBe(e.days_on_target);
    expect(a.days_judged, `${id} days_judged`).toBe(e.days_judged);
    expect(a.highest, `${id} highest`).toEqual(e.highest);
    expect(a.lowest, `${id} lowest`).toEqual(e.lowest);
    expect(a.bars.length, `${id} bar_count`).toBe(e.bar_count);
    expect(a.bars.filter((b) => b.value !== null), `${id} bars`).toEqual(e.bars);
    expectClose(a.top, e.top, `${id} top`);
    expect(a.weekdays.map((d) => ({ average: d.average, days: d.days, over: d.over })), `${id} weekdays`).toEqual(e.weekdays);
  });

  it('runs the weekdays from Monday to Sunday', () => {
    const { weekdays } = trendsSummary({ today: '2026-10-17', range: '7D', targets: {}, days: [] });
    expect(weekdays.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
  });
});

describe('weight/change.json', () => {
  it.each(change.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    expectClose(trendChange(c.input.entries, c.input.to, c.input.days), c.expected.change_kg, `${id} change_kg`);
  });
});

describe('a partly logged day in Trends (decision 47)', () => {
  const item = (kcal: number) => ({ kcal, protein_g: 10, carbs_g: 10, fat_g: 10, fibre_g: 1 });
  const input = {
    today: '2026-11-14',
    range: '7D' as const,
    targets: { kcal: 2000, protein_g: null, carbs_g: null, fat_g: null, fibre_g: null },
    days: [
      { local_date: '2026-11-12', items: [item(144)] },
      { local_date: '2026-11-13', items: [item(1800)] },
      { local_date: '2026-11-14', items: [item(2200)] },
    ],
  };
  it('is not the lowest day and is not in the average', () => {
    const s = trendsSummary(input);
    expect(s.lowest).toEqual({ local_date: '2026-11-13', kcal: 1800 });
    expect(s.window.measures.kcal.average).toBe(2000);
    expect(s.window.skipped).toEqual([{ local_date: '2026-11-12', why: 'auto' }]);
    expect(s.days_judged).toBe(2);
  });
  it('counts again when the user counts it', () => {
    const s = trendsSummary({ ...input, choices: { '2026-11-12': 'count' } });
    expect(s.lowest).toEqual({ local_date: '2026-11-12', kcal: 144 });
    expect(s.window.skipped).toEqual([]);
  });
});
