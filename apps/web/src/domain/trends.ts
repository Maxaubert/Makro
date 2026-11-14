// The Trends summary (D_Trends), pinned by packages/contracts/guidance/trends.json. Pure: no clock, no database.
// A day with nothing logged is left out and never read as 0; unknown values stay null with coverage (rule 2).
import { GUIDANCE_CONSTANTS, averageOver, targetBand, type TargetBand, type WeeklyAverage, type WeeklyDay, type WeeklyInput, type WeeklyMeasureKey } from './guidance';
import { shiftDay } from './weight';

export const TREND_RANGES = ['7D', '30D', '90D'] as const;
export type TrendRange = (typeof TREND_RANGES)[number];
export const TREND_RANGE_DAYS: Record<TrendRange, number> = { '7D': 7, '30D': 30, '90D': 90 };

export const TREND_MEASURES = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g'] as const satisfies readonly WeeklyMeasureKey[];

export type TrendBand = TargetBand;

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;
/** The chart's top is 125% of the target, as on the board (goal 2,400, top 3,000). */
const CHART_HEADROOM = 1.25;
const WEEK_DAYS = 7;

export interface TrendBar {
  from: string;
  to: string;
  value: number | null;
  band: TrendBand | null;
}

export interface TrendWeekday {
  label: (typeof WEEKDAY_LABELS)[number];
  average: number | null;
  days: number;
  over: boolean;
}

export interface TrendDayValue {
  local_date: string;
  kcal: number;
}

export interface TrendsSummary {
  /** Dates, logged days and the average and coverage of each measure. */
  window: WeeklyAverage;
  difference: number | null;
  /** null when there is no goal to judge against. */
  days_on_target: number | null;
  days_judged: number;
  highest: TrendDayValue | null;
  lowest: TrendDayValue | null;
  bars: TrendBar[];
  top: number;
  weekdays: TrendWeekday[];
}

export interface TrendsInput extends Pick<WeeklyInput, 'targets' | 'days' | 'choices'> {
  today: string;
  range: TrendRange;
}

const mean = (values: number[]): number | null => (values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0) / values.length);
// Only counted days: a partly logged or left-out day is not a real day's eating (decision 47).
const knownValues = (days: WeeklyDay[]): number[] => days.flatMap((d) => (d.value === null || !d.counted ? [] : [d.value]));
const isKnown = (d: WeeklyDay): d is WeeklyDay & { value: number } => d.value !== null && d.counted;

function bar(days: WeeklyDay[], target: number | null): TrendBar {
  const value = mean(knownValues(days));
  return {
    from: days[0].local_date,
    to: days[days.length - 1].local_date,
    value,
    band: value === null || target === null ? null : targetBand(value, target),
  };
}

/** The chart's bars for any measure: one per day, or one per week (mean of counted days) for 90D. */
export function barsFor(days: WeeklyDay[], range: TrendRange, target: number | null): TrendBar[] {
  if (range !== '90D') return days.map((d) => bar([d], target));
  const bars: TrendBar[] = [];
  for (let end = days.length; end > 0; end -= WEEK_DAYS) bars.unshift(bar(days.slice(Math.max(0, end - WEEK_DAYS), end), target));
  return bars;
}

function weekdaysFor(days: WeeklyDay[], target: number | null): TrendWeekday[] {
  return WEEKDAY_LABELS.map((label, i) => {
    const values = knownValues(days.filter((d) => mondayIndex(d.local_date) === i));
    const average = mean(values);
    return { label, average, days: values.length, over: average !== null && target !== null && average > target * GUIDANCE_CONSTANTS.weekday_over_high };
  });
}

function mondayIndex(localDate: string): number {
  const [y, m, d] = localDate.split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export function trendsSummary({ today, range, targets, days, choices }: TrendsInput): TrendsSummary {
  const count = TREND_RANGE_DAYS[range];
  const dates = Array.from({ length: count }, (_, i) => shiftDay(today, i + 1 - count));
  const window = averageOver(dates, { targets, days, choices }, TREND_MEASURES);
  const kcal = window.measures.kcal;
  const goal = targets.kcal ?? null;
  const target = goal !== null && goal > 0 ? goal : null;

  // Dates run oldest first, so keeping the first of equals makes ties take the earlier date.
  const known = kcal.days.filter(isKnown);
  const pick = (better: (a: number, b: number) => boolean): TrendDayValue | null => {
    if (known.length === 0) return null;
    const best = known.reduce((a, b) => (better(b.value, a.value) ? b : a));
    return { local_date: best.local_date, kcal: best.value };
  };

  const bars = barsFor(kcal.days, range, target);
  const weekdays = weekdaysFor(kcal.days, target);
  const drawn = [...bars.map((b) => b.value), ...weekdays.map((d) => d.average)].filter((v): v is number => v !== null);

  return {
    window,
    difference: kcal.average !== null && target !== null ? kcal.average - target : null,
    days_on_target: target === null ? null : known.filter((d) => targetBand(d.value, target) === 'on_target').length,
    days_judged: known.length,
    highest: pick((a, b) => a > b),
    lowest: pick((a, b) => a < b),
    bars,
    top: Math.max(target !== null ? target * CHART_HEADROOM : 0, ...drawn, 1),
    weekdays,
  };
}
