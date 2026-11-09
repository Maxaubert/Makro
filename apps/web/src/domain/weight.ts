// Body-weight maths, pinned by packages/contracts/weight/*.json. Pure: no clock, no database.
//
// How the trend is defined (the same text is in weight/trend.json):
// - Several entries on one day count as one day: the day's value is their mean.
// - A day with no entry has no value. It is left out of the sum and the divisor. It is never 0
//   and never filled in from its neighbours (accuracy rule 2).
// - The trend on day D is the mean of the daily values in the 7 calendar days D-6..D.
// - With fewer than 3 days of values in that window the trend is unknown (null), because one
//   or two weigh-ins are exactly the daily noise the trend is there to smooth away.
import { WEIGHT_RANGE_KG, type GoalType } from './goals';

export const TREND_WINDOW_DAYS = 7;
export const TREND_MIN_DAYS = 3;

export interface WeightPoint {
  local_date: string;
  weight_kg: number;
}

export interface TrendDay {
  date: string;
  weight_kg: number | null;
  entries: number;
  trend_kg: number | null;
  covered_days: number;
}

export interface WeightSummary {
  days: TrendDay[];
  stats: { lowest_kg: number | null; highest_kg: number | null; average_kg: number | null };
  change_7d_kg: number | null;
}

/** Calendar arithmetic on YYYY-MM-DD strings, so time zones and daylight saving cannot enter. */
function shiftDay(localDate: string, n: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function dailyValues(entries: WeightPoint[]): Map<string, { value: number; entries: number }> {
  const byDay = new Map<string, number[]>();
  for (const e of entries) {
    const list = byDay.get(e.local_date);
    if (list) list.push(e.weight_kg);
    else byDay.set(e.local_date, [e.weight_kg]);
  }
  return new Map([...byDay].map(([date, list]) => [date, { value: mean(list), entries: list.length }]));
}

function trendOn(daily: Map<string, { value: number }>, date: string): { trend_kg: number | null; covered_days: number } {
  const known: number[] = [];
  for (let i = TREND_WINDOW_DAYS - 1; i >= 0; i--) {
    const day = daily.get(shiftDay(date, -i));
    if (day) known.push(day.value);
  }
  return { trend_kg: known.length >= TREND_MIN_DAYS ? mean(known) : null, covered_days: known.length };
}

/** Every calendar day from..to with its value and trend, the range's stats, and the 7-day trend change. */
export function weightSummary(entries: WeightPoint[], from: string, to: string): WeightSummary {
  const daily = dailyValues(entries);
  const days: TrendDay[] = [];
  for (let date = from; date <= to; date = shiftDay(date, 1)) {
    const day = daily.get(date);
    days.push({ date, weight_kg: day?.value ?? null, entries: day?.entries ?? 0, ...trendOn(daily, date) });
  }
  const values = days.flatMap((d) => (d.weight_kg === null ? [] : [d.weight_kg]));
  const end = trendOn(daily, to).trend_kg;
  const start = trendOn(daily, shiftDay(to, -7)).trend_kg;
  return {
    days,
    stats: {
      lowest_kg: values.length ? Math.min(...values) : null,
      highest_kg: values.length ? Math.max(...values) : null,
      average_kg: values.length ? mean(values) : null,
    },
    change_7d_kg: end !== null && start !== null ? end - start : null,
  };
}

/** How far a weight is from the goal's target. Unknown stays unknown; maintain has no direction. */
export function toGoal(weight_kg: number | null, target_kg: number | null, goal_type: GoalType): { kg: number | null; reached: boolean } {
  if (weight_kg === null || target_kg === null || goal_type === 'maintain') return { kg: null, reached: false };
  const reached = goal_type === 'lose' ? weight_kg <= target_kg : weight_kg >= target_kg;
  return { kg: reached ? 0 : Math.abs(weight_kg - target_kg), reached };
}

export function isPlausibleWeight(kg: number): boolean {
  return Number.isFinite(kg) && kg >= WEIGHT_RANGE_KG.min && kg <= WEIGHT_RANGE_KG.max;
}

export const WEIGHT_RANGES = ['7D', '30D', '90D', 'All'] as const;
export type WeightRange = (typeof WEIGHT_RANGES)[number];

const RANGE_DAYS: Record<Exclude<WeightRange, 'All'>, number> = { '7D': 7, '30D': 30, '90D': 90 };

/** First day shown for a range ending today; All starts at the first entry. */
export function rangeStart(range: WeightRange, today: string, firstEntry: string | null): string {
  if (range !== 'All') return shiftDay(today, 1 - RANGE_DAYS[range]);
  return firstEntry !== null && firstEntry < today ? firstEntry : today;
}

/** A row's day as on the board: "Today", or "Fri 16 Oct" with no comma. */
export function entryDayLabel(localDate: string, today: string): string {
  if (localDate === today) return 'Today';
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
}

// ---- chart geometry, in the canvas's 326 x 116 box -------------------------------------------

const BOX = { width: 326, baseline: 110, top: 4, edge: 4, barWidth: 6 };
/** With no trend yet the chart gets a kg axis: room for its labels on the left and above the top line. */
const AXIS = { top: 16, gutter: 30 };

export interface ChartBar {
  date: string;
  x: number;
  y: number;
  width: number;
  height: number;
  latest: boolean;
}

export interface ChartSlot {
  date: string;
  x: number;
  width: number;
  weight_kg: number | null;
  trend_kg: number | null;
}

export interface ChartLayout {
  bars: ChartBar[];
  /** One list of points per unbroken stretch of known trend. */
  trend: { x: number; y: number }[][];
  /** One full-height slot per day, for hit targets. */
  slots: ChartSlot[];
  /** Labelled kg lines, top first. Only while there is no trend line; the board's full chart has none. */
  axis: { kg: number; y: number }[];
}

/**
 * Every day of the range gets an evenly spaced slot, with 6 wide bars until the days get too tight.
 * Bars rise from a floor just below the lowest value, as on the canvas, so changes of a few hundred
 * grams stay visible. A day with no entry gets no bar and a null trend breaks the line.
 *
 * Until a trend exists there may be a single bar, so the floor and ceiling become whole kilos a
 * step outside the values and are drawn as a labelled axis, which keeps it readable as a graph.
 */
export function chartLayout(days: TrendDay[]): ChartLayout {
  const values = days.flatMap((d) => [d.weight_kg, d.trend_kg]).filter((v): v is number => v !== null);
  const sparse = values.length > 0 && days.every((d) => d.trend_kg === null);
  const left = sparse ? AXIS.gutter : BOX.edge;
  const right = BOX.width - BOX.edge;
  const step = days.length > 1 ? (right - left) / (days.length - 1) : BOX.width;
  const center = (i: number) => (days.length > 1 ? left + i * step : BOX.width / 2);
  const slots = days.map((d, i) => ({ date: d.date, x: center(i) - step / 2, width: step, weight_kg: d.weight_kg, trend_kg: d.trend_kg }));
  if (values.length === 0) return { bars: [], trend: [], slots, axis: [] };

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(hi - lo, 1);
  const floor = sparse ? Math.floor(lo) - 1 : lo - span * 0.35;
  const ceiling = sparse ? Math.ceil(hi) + 1 : hi + span * 0.1;
  const top = sparse ? AXIS.top : BOX.top;
  const y = (v: number) => BOX.baseline - ((v - floor) / (ceiling - floor)) * (BOX.baseline - top);
  const barWidth = Math.max(1, Math.min(step * 0.6, BOX.barWidth));

  let latestIndex = -1;
  days.forEach((d, i) => {
    if (d.weight_kg !== null) latestIndex = i;
  });

  const bars: ChartBar[] = [];
  const trend: { x: number; y: number }[][] = [];
  let open = false;
  days.forEach((d, i) => {
    if (d.weight_kg !== null) {
      const barTop = y(d.weight_kg);
      bars.push({ date: d.date, x: center(i) - barWidth / 2, y: barTop, width: barWidth, height: BOX.baseline - barTop, latest: i === latestIndex });
    }
    if (d.trend_kg === null) {
      open = false;
      return;
    }
    if (!open) trend.push([]);
    open = true;
    trend[trend.length - 1].push({ x: center(i), y: y(d.trend_kg) });
  });
  const axis = sparse ? [ceiling, (ceiling + floor) / 2, floor].map((kg) => ({ kg, y: y(kg) })) : [];
  return { bars, trend, slots, axis };
}
