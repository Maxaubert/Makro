import { describe, expect, it } from 'vitest';
import { expectClose, loadGolden } from './golden';
import type { GoalType } from './goals';
import { chartLayout, entryDayLabel, goalEstimate, isPlausibleWeight, rangeStart, toGoal, weighInChanges, weightLine, weightLineFill, weightLineGaps, weightLineTicks, weightSummary, type TrendDay, type WeightSummary } from './weight';

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

const rangeGolden = loadGolden<{ days: (number | null)[] }, { kg: number | null }>('weight/range_change.json');
const weighIns = loadGolden<{ weights: number[] }, { changes: (number | null)[] }>('weight/weigh_in_change.json');
const estimate = loadGolden<
  { weight_kg: number | null; start_kg: number | null; target_kg: number | null; pace_kg_per_week: number | null; goal_type: GoalType },
  { weeks: number | null; progress: number | null }
>('weight/goal_estimate.json');

describe('weight/range_change.json', () => {
  it.each(rangeGolden.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    const days = c.input.days.map((weight_kg, i): TrendDay => ({ date: String(i), weight_kg, entries: weight_kg === null ? 0 : 1, trend_kg: null, covered_days: 0 }));
    expectClose(weightLine(days).change_kg, c.expected.kg, id);
  });
});

describe('weight/weigh_in_change.json', () => {
  it.each(weighIns.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    const actual = weighInChanges(c.input.weights.map((weight_kg) => ({ weight_kg })));
    expect(actual).toHaveLength(c.expected.changes.length);
    c.expected.changes.forEach((e, i) => expectClose(actual[i], e, `${id} ${i}`));
  });
});

describe('weight/goal_estimate.json', () => {
  it.each(estimate.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    const actual = goalEstimate(c.input);
    expect(actual.weeks, `${id} weeks`).toBe(c.expected.weeks);
    expectClose(actual.progress, c.expected.progress, `${id} progress`);
  });
});

describe('weightLineFill', () => {
  it('is empty with no weigh-ins', () => {
    expect(weightLineFill([])).toEqual([]);
  });
  it('turns one weigh-in into a flat line across the whole chart', () => {
    expect(weightLineFill([[{ x: 700, y: 100 }]])).toEqual([{ x: 0, y: 100 }, { x: 700, y: 100 }]);
  });
  it('joins the weigh-ins across gaps and holds them flat to both edges', () => {
    expect(weightLineFill([[{ x: 100, y: 50 }, { x: 200, y: 60 }], [{ x: 500, y: 80 }]])).toEqual([
      { x: 0, y: 50 },
      { x: 100, y: 50 },
      { x: 200, y: 60 },
      { x: 500, y: 80 },
      { x: 700, y: 80 },
    ]);
  });
  it('adds no extra point at an edge that already has a weigh-in', () => {
    expect(weightLineFill([[{ x: 0, y: 50 }, { x: 700, y: 60 }]])).toEqual([{ x: 0, y: 50 }, { x: 700, y: 60 }]);
  });
});

describe('weightLineTicks and weightLineGaps', () => {
  const at = (date: string, weight_kg: number | null): TrendDay => ({ date, weight_kg, entries: weight_kg === null ? 0 : 1, trend_kg: null, covered_days: 0 });

  it('has no ticks with no weigh-ins', () => {
    expect(weightLineTicks([at('2026-10-01', null), at('2026-10-02', null)])).toEqual([]);
  });

  it('labels three ticks from the top: highest, middle, lowest', () => {
    const ticks = weightLineTicks([at('2026-10-01', 80), at('2026-10-02', 82)]);
    expect(ticks.map((t) => t.top)).toEqual([0, 50, 100]);
    expect(ticks[0].kg).toBeCloseTo(82.36);
    expect(ticks[1].kg).toBeCloseTo(81);
    expect(ticks[2].kg).toBeCloseTo(79.64);
  });

  it('pads one flat value without dividing by zero', () => {
    const ticks = weightLineTicks([at('2026-10-01', null), at('2026-10-02', 80)]);
    expect(ticks[0].kg).toBeCloseTo(80.5);
    expect(ticks[2].kg).toBeCloseTo(79.5);
  });

  it('joins segments across a missing day without adding a point', () => {
    const { segments } = weightLine([at('2026-10-01', 80), at('2026-10-02', 81), at('2026-10-03', null), at('2026-10-04', 82)]);
    const gaps = weightLineGaps(segments);
    expect(gaps).toHaveLength(1);
    expect(gaps[0][0]).toEqual(segments[0][1]);
    expect(gaps[0][1]).toEqual(segments[1][0]);
  });

  it('has no gaps in an unbroken line', () => {
    expect(weightLineGaps(weightLine([at('2026-10-01', 80), at('2026-10-02', 81)]).segments)).toEqual([]);
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
      expect(b.y + b.height).toBeCloseTo(110);
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

  const range = (n: number, trend_kg: number | null = 80): TrendDay[] =>
    Array.from({ length: n }, (_, i) => day(`2026-10-${String((i % 28) + 1).padStart(2, '0')}-${i}`, 80 + (i % 3), trend_kg));

  it('uses the board proportions: 6 wide bars on a baseline at 110, edge to edge with even spacing', () => {
    const c = chartLayout(range(30));
    expect(c.bars).toHaveLength(30);
    expect(c.bars[0].width).toBe(6);
    expect(c.bars[0].x).toBeCloseTo(1);
    expect(c.bars[29].x).toBeCloseTo(319);
    const gaps = c.bars.slice(1).map((b, i) => b.x - c.bars[i].x);
    for (const g of gaps) expect(g).toBeCloseTo(gaps[0]);
    for (const b of c.bars) expect(b.y + b.height).toBeCloseTo(110);
  });

  it('matches the board bar heights for its lowest and highest day', () => {
    const c = chartLayout([day('2026-10-01', 80.9, 81), day('2026-10-02', 83.2, 81)]);
    expect(c.bars[0].height).toBeCloseTo(25.5, 0);
    expect(c.bars[1].height).toBeCloseTo(98.5, 0);
  });

  it('keeps 6 wide bars on a short range and narrows them when days get tight', () => {
    expect(chartLayout(range(7)).bars[0].width).toBe(6);
    const tight = chartLayout(range(90));
    const step = tight.bars[1].x - tight.bars[0].x;
    expect(tight.bars[0].width).toBeLessThan(step);
    expect(tight.bars[0].width).toBeGreaterThanOrEqual(1);
  });

  it('centres a range of one day', () => {
    const c = chartLayout([day('2026-10-01', 81.5, null)]);
    expect(c.bars[0].x + c.bars[0].width / 2).toBeCloseTo(163);
  });

  it('gives a graph with no trend yet a labelled kg axis, so one weigh-in still reads as a graph', () => {
    const c = chartLayout([...Array.from({ length: 29 }, (_, i) => day(`2026-10-${String(i + 1).padStart(2, '0')}`, null, null)), day('2026-10-30', 81.5, null)]);
    expect(c.axis.map((a) => a.kg)).toEqual([83, 81.5, 80]);
    expect(c.axis[2].y).toBeCloseTo(110);
    expect(c.axis[0].y).toBeGreaterThanOrEqual(13);
    expect(c.bars[0].y).toBeCloseTo(c.axis[1].y);
    expect(c.bars[0].x).toBeGreaterThan(30);
  });

  it('keeps bars clear of the kg labels when the first day of a sparse range has a weigh-in', () => {
    const c = chartLayout([day('2026-10-01', 81, null), day('2026-10-02', 82, null)]);
    expect(c.bars[0].x).toBeGreaterThanOrEqual(26);
  });

  it('has no kg axis once a trend exists, as on the board, and none for an empty range', () => {
    expect(chartLayout(range(30)).axis).toEqual([]);
    expect(chartLayout([day('2026-10-01', null, null)]).axis).toEqual([]);
  });
});

describe('weightLine', () => {
  const on = (date: string, weight_kg: number | null): TrendDay => ({ date, weight_kg, entries: weight_kg === null ? 0 : 1, trend_kg: null, covered_days: 0 });

  it('has no line, no latest point and no change without a weigh-in', () => {
    expect(weightLine([on('2026-10-01', null), on('2026-10-02', null)])).toEqual({ segments: [], latest: null, change_kg: null });
  });

  it('spreads the days over the width and pads the height by 18% of the span', () => {
    const line = weightLine([on('2026-10-01', 80), on('2026-10-02', 82), on('2026-10-03', 81)]);
    expect(line.segments).toHaveLength(1);
    expect(line.segments[0].map((p) => p.x)).toEqual([0, 350, 700]);
    const [low, high, mid] = line.segments[0].map((p) => p.y);
    expect(low).toBeCloseTo(200 - (0.36 / 2.72) * 200, 1);
    expect(high).toBeCloseTo(200 - (2.36 / 2.72) * 200, 1);
    expect(mid).toBeCloseTo(100, 1);
  });

  it('breaks the line at a day with no weigh-in instead of bridging it', () => {
    const line = weightLine([on('2026-10-01', 80), on('2026-10-02', 81), on('2026-10-03', null), on('2026-10-04', 82), on('2026-10-05', 83)]);
    expect(line.segments.map((s) => s.map((p) => p.x))).toEqual([[0, 175], [525, 700]]);
  });

  it('keeps a lone weigh-in as a one-point segment and has no change to report', () => {
    const line = weightLine([on('2026-10-01', null), on('2026-10-02', 81), on('2026-10-03', null)]);
    expect(line.segments).toEqual([[{ x: 350, y: 100 }]]);
    expect(line.change_kg).toBeNull();
  });

  it('puts a single day on the right edge, with half a kilo of room when the values are flat', () => {
    expect(weightLine([on('2026-10-01', 81.5)]).segments).toEqual([[{ x: 700, y: 100 }]]);
  });

  it('marks the latest weigh-in, which need not be the last day', () => {
    const line = weightLine([on('2026-10-01', 80), on('2026-10-02', 81), on('2026-10-03', null)]);
    expect(line.latest).toEqual(line.segments[0][1]);
  });

  it('reports the change from the first to the last weigh-in in the range', () => {
    expect(weightLine([on('2026-10-01', null), on('2026-10-02', 83), on('2026-10-03', null), on('2026-10-04', 81.5)]).change_kg).toBeCloseTo(-1.5, 5);
  });
});

describe('entryDayLabel', () => {
  it('says Today for today', () => {
    expect(entryDayLabel('2026-11-09', '2026-11-09')).toBe('Today');
  });

  it('writes other days as on the board, without a comma', () => {
    expect(entryDayLabel('2026-10-16', '2026-11-09')).toBe('Fri 16 Oct');
  });
});
