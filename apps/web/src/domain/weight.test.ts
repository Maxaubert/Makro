import { describe, expect, it } from 'vitest';
import { expectClose, loadGolden } from './golden';
import type { GoalType } from './goals';
import { chartLayout, isPlausibleWeight, rangeStart, toGoal, weightSummary, type TrendDay, type WeightSummary } from './weight';

const trend = loadGolden<{ entries: { local_date: string; weight_kg: number }[]; from: string; to: string }, WeightSummary>('weight/trend.json');
const goal = loadGolden<{ weight_kg: number | null; target_kg: number | null; goal_type: GoalType }, { kg: number | null; reached: boolean }>('weight/to_goal.json');

describe('weight/trend.json', () => {
  it.each(trend.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    const actual = weightSummary(c.input.entries, c.input.from, c.input.to);
    expect(actual.days.map((d) => d.date), `${id} dates`).toEqual(c.expected.days.map((d) => d.date));
    c.expected.days.forEach((e, i) => {
      const a = actual.days[i];
      expect(a.entries, `${id} ${e.date} entries`).toBe(e.entries);
      expect(a.covered_days, `${id} ${e.date} covered_days`).toBe(e.covered_days);
      expectClose(a.weight_kg, e.weight_kg, `${id} ${e.date} weight_kg`);
      expectClose(a.trend_kg, e.trend_kg, `${id} ${e.date} trend_kg`);
    });
    expectClose(actual.stats.lowest_kg, c.expected.stats.lowest_kg, `${id} lowest_kg`);
    expectClose(actual.stats.highest_kg, c.expected.stats.highest_kg, `${id} highest_kg`);
    expectClose(actual.stats.average_kg, c.expected.stats.average_kg, `${id} average_kg`);
    expectClose(actual.change_7d_kg, c.expected.change_7d_kg, `${id} change_7d_kg`);
  });
});

describe('weight/to_goal.json', () => {
  it.each(goal.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    const actual = toGoal(c.input.weight_kg, c.input.target_kg, c.input.goal_type);
    expectClose(actual.kg, c.expected.kg, `${id} kg`);
    expect(actual.reached, `${id} reached`).toBe(c.expected.reached);
  });
});

describe('rangeStart', () => {
  it('counts today as the last day of the range', () => {
    expect(rangeStart('7D', '2026-10-30', null)).toBe('2026-10-24');
    expect(rangeStart('30D', '2026-10-30', null)).toBe('2026-10-01');
    expect(rangeStart('90D', '2026-10-30', null)).toBe('2026-08-02');
  });

  it('starts All at the first entry, or today with none', () => {
    expect(rangeStart('All', '2026-10-30', '2025-02-03')).toBe('2025-02-03');
    expect(rangeStart('All', '2026-10-30', null)).toBe('2026-10-30');
  });
});

describe('isPlausibleWeight', () => {
  it('uses the same limits as the profile', () => {
    expect(isPlausibleWeight(30)).toBe(true);
    expect(isPlausibleWeight(400)).toBe(true);
    expect(isPlausibleWeight(29.9)).toBe(false);
    expect(isPlausibleWeight(400.1)).toBe(false);
    expect(isPlausibleWeight(Number.NaN)).toBe(false);
  });
});

describe('chartLayout', () => {
  const day = (date: string, weight_kg: number | null, trend_kg: number | null): TrendDay => ({
    date,
    weight_kg,
    trend_kg,
    entries: weight_kg === null ? 0 : 1,
    covered_days: 0,
  });

  it('draws nothing for an empty range', () => {
    const c = chartLayout([day('2026-10-01', null, null), day('2026-10-02', null, null)]);
    expect(c.bars).toEqual([]);
    expect(c.trend).toEqual([]);
    expect(c.slots).toHaveLength(2);
  });

  it('leaves a gap for a day with no entry, not a bar', () => {
    const c = chartLayout([day('2026-10-01', 80, null), day('2026-10-02', null, null), day('2026-10-03', 81, null)]);
    expect(c.bars.map((b) => b.date)).toEqual(['2026-10-01', '2026-10-03']);
  });

  it('breaks the trend line where the trend is unknown', () => {
    const c = chartLayout([
      day('2026-10-01', 80, 80),
      day('2026-10-02', 80, 80),
      day('2026-10-03', null, null),
      day('2026-10-04', 80, 80),
    ]);
    expect(c.trend.map((s) => s.length)).toEqual([2, 1]);
  });

  it('keeps the trend line going over a day with no entry when the trend is known', () => {
    const c = chartLayout([day('2026-10-01', 80, 80), day('2026-10-02', null, 80), day('2026-10-03', 80, 80)]);
    expect(c.trend.map((s) => s.length)).toEqual([3]);
  });

  it('makes a heavier day a taller bar and stays inside the box', () => {
    const c = chartLayout([day('2026-10-01', 80, null), day('2026-10-02', 82, null)]);
    expect(c.bars[1].height).toBeGreaterThan(c.bars[0].height);
    for (const b of c.bars) {
      expect(b.height).toBeGreaterThan(0);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y + b.height).toBeCloseTo(150);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(326);
    }
  });

  it('handles one flat value without dividing by zero', () => {
    const c = chartLayout([day('2026-10-01', 80, 80)]);
    expect(Number.isFinite(c.bars[0].y)).toBe(true);
    expect(Number.isFinite(c.trend[0][0].y)).toBe(true);
  });

  it('marks only the most recent day with an entry', () => {
    const c = chartLayout([day('2026-10-01', 80, null), day('2026-10-02', 81, null), day('2026-10-03', null, null)]);
    expect(c.bars.map((b) => b.latest)).toEqual([false, true]);
  });
});
