// Guidance (#27, #53): the weekly average, what is left today, suggestions that fit the gap, and
// the end-of-day status. Pure and rule-based: every number comes from stored totals or the
// database, never from AI (rule 1). Checked by packages/contracts/guidance/*.json.
// Unknown stays null with a count of covered entries, and is never read as 0 (rule 2).
import { dayTotals, type NutrientTotal } from './totals';
import type { NutrientValues } from './portion';

/** The lines are provisional: see packages/contracts/guidance/constants.json. */
export const GUIDANCE_CONSTANTS = {
  well_under_below: 0.75,
  on_target_low: 0.9,
  on_target_high: 1.1,
  incomplete_min_entries: 3,
  incomplete_ended_before_minute: 960,
  incomplete_gap_minutes: 480,
  suggestion_limit: 3,
  weekday_over_high: 1.05,
  partial_day_below: 0.5,
};

export const WEEKLY_MEASURES = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g'] as const;
export type WeeklyMeasureKey = (typeof WEEKLY_MEASURES)[number];
export const REMAINING_MEASURES = ['kcal', 'protein_g', 'carbs_g', 'fat_g'] as const;
export type RemainingKey = (typeof REMAINING_MEASURES)[number];

function shiftDate(localDate: string, n: number): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** The days from Monday of this week to the day before `today`. Empty on a Monday. */
export function weekWindow(today: string): string[] {
  const [y, m, d] = today.split('-').map(Number);
  const daysSinceMonday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
  return Array.from({ length: daysSinceMonday }, (_, i) => shiftDate(today, i - daysSinceMonday));
}

export type TargetBand = 'under' | 'on_target' | 'over';

/** Where a known amount falls against a target above 0. The edges of the band are on target. */
export function targetBand(value: number, target: number): TargetBand {
  const r = value / target;
  return r < GUIDANCE_CONSTANTS.on_target_low ? 'under' : r <= GUIDANCE_CONSTANTS.on_target_high ? 'on_target' : 'over';
}

export type Verdict = 'on_target' | 'a_bit_under' | 'well_under' | 'above_target';

export function weeklyVerdict(average: number | null, target: number | null): Verdict | null {
  if (average === null || target === null || target <= 0) return null;
  const r = average / target;
  if (r < GUIDANCE_CONSTANTS.well_under_below) return 'well_under';
  if (r < GUIDANCE_CONSTANTS.on_target_low) return 'a_bit_under';
  return r <= GUIDANCE_CONSTANTS.on_target_high ? 'on_target' : 'above_target';
}

/** What the user chose for a day: count it whatever it looks like, or leave it out. */
export type DayChoice = 'count' | 'skip';

export interface WeeklyInput {
  today: string;
  targets: Record<string, number | null>;
  days: { local_date: string; items: NutrientValues[] }[];
  /** The user's choices by date (decision 47). A day without one follows the automatic rule. */
  choices?: Record<string, DayChoice>;
}

export interface WeeklyDay extends NutrientTotal {
  local_date: string;
  /** At least one entry that day. A day without one is left out, never counted as 0. */
  logged: boolean;
  /** In the average. False for an unlogged day and for a skipped one. */
  counted: boolean;
  /**
   * Why a logged day is left out: 'auto' when its known calories are under half the calorie target
   * (it looks partly logged), 'user' when the user left it out. null for a counted or unlogged day.
   */
  skipped: 'auto' | 'user' | null;
}

export interface WeeklyMeasure {
  average: number | null;
  days_with_value: number;
  covered: number;
  count: number;
  verdict: Verdict | null;
  days: WeeklyDay[];
}

export interface WeeklyAverage {
  dates: string[];
  counted_days: number;
  /** Days with nothing logged. */
  left_out: string[];
  /** Logged days that are not counted: partly logged (auto) or left out by the user. */
  skipped: { local_date: string; why: 'auto' | 'user' }[];
  measures: Record<string, WeeklyMeasure>;
}

/**
 * Whether a logged day is skipped, and why (decision 47). The user's choice wins. Otherwise a day
 * whose known calories are under half the calorie target looks partly logged and is skipped.
 * Unknown calories, or no calorie target, never skip a day on their own: unknown is not low (rule 2).
 */
export function daySkip(items: NutrientValues[], kcalTarget: number | null | undefined, choice: DayChoice | undefined): 'auto' | 'user' | null {
  if (choice === 'skip') return 'user';
  if (choice === 'count') return null;
  if (kcalTarget === null || kcalTarget === undefined || kcalTarget <= 0) return null;
  const kcal = dayTotals(items.map((i) => ({ kcal: i.kcal ?? null })), ['kcal']).kcal.value;
  return kcal !== null && kcal < kcalTarget * GUIDANCE_CONSTANTS.partial_day_below ? 'auto' : null;
}

export function weeklyAverage(input: WeeklyInput, measures: readonly string[] = WEEKLY_MEASURES): WeeklyAverage {
  return averageOver(weekWindow(input.today), input, measures);
}

/**
 * The per-counted-day average over any list of dates. A day with nothing logged is left out, never 0,
 * and so is a skipped day (decision 47). Skipped days keep their values in `days` for drawing.
 */
export function averageOver(dates: string[], input: Pick<WeeklyInput, 'targets' | 'days' | 'choices'>, measures: readonly string[] = WEEKLY_MEASURES): WeeklyAverage {
  const itemsOf = new Map(input.days.map((d) => [d.local_date, d.items]));
  const logged = (date: string) => (itemsOf.get(date)?.length ?? 0) > 0;
  const skipOf = new Map(dates.map((d) => [d, logged(d) ? daySkip(itemsOf.get(d) ?? [], input.targets.kcal, input.choices?.[d]) : null]));
  const counted = (date: string) => logged(date) && skipOf.get(date) === null;
  const out: Record<string, WeeklyMeasure> = {};
  for (const n of measures) {
    const days = dates.map((local_date): WeeklyDay => ({
      local_date,
      logged: logged(local_date),
      counted: counted(local_date),
      skipped: skipOf.get(local_date) ?? null,
      ...dayTotals(itemsOf.get(local_date) ?? [], [n])[n],
    }));
    const inAverage = days.filter((d) => d.counted);
    const known = inAverage.filter((d) => d.value !== null);
    const average = known.length === 0 ? null : known.reduce((sum, d) => sum + (d.value as number), 0) / known.length;
    out[n] = {
      average,
      days_with_value: known.length,
      covered: inAverage.reduce((sum, d) => sum + d.covered, 0),
      count: inAverage.reduce((sum, d) => sum + d.count, 0),
      verdict: weeklyVerdict(average, input.targets[n] ?? null),
      days,
    };
  }
  return {
    dates,
    counted_days: dates.filter(counted).length,
    left_out: dates.filter((d) => !logged(d)),
    skipped: dates.flatMap((local_date) => { const why = skipOf.get(local_date); return why ? [{ local_date, why }] : []; }),
    measures: out,
  };
}

export interface RemainingValue {
  /** Target minus the known sum eaten; negative when over; null when it cannot be known. */
  left: number | null;
  /** False when some entries have no value, so `left` is only an upper bound. */
  exact: boolean;
}

export function remainingToday(
  totals: Record<string, NutrientTotal>,
  targets: Record<string, number | null> | null,
  measures: readonly string[] = REMAINING_MEASURES,
): Record<string, RemainingValue> {
  const out: Record<string, RemainingValue> = {};
  for (const n of measures) {
    const t = totals[n];
    const target = targets?.[n] ?? null;
    if (target === null || (t.count > 0 && t.value === null)) {
      out[n] = { left: null, exact: false };
      continue;
    }
    // value is null here only when nothing is logged yet, and then nothing has been eaten.
    out[n] = { left: target - (t.value ?? 0), exact: t.covered === t.count };
  }
  return out;
}

export type DayStatusKind = 'not_logged' | 'unknown' | 'no_target' | 'on_target' | 'under' | 'over';
export type IncompleteReason = 'missing_values' | 'few_entries' | 'ended_early' | 'long_gap';

export interface DayStatusInput {
  entries: { kcal: number | null; eaten_minutes: number | null }[];
  kcal_target: number | null;
}

export interface DayStatus {
  status: DayStatusKind;
  eaten: number | null;
  covered: number;
  count: number;
  difference: number | null;
  may_be_incomplete: boolean;
  reasons: IncompleteReason[];
}

/** An unlogged day is never treated as fasting: it has no status against the target at all. */
export function dayStatus({ entries, kcal_target }: DayStatusInput): DayStatus {
  const { value: eaten, covered, count } = dayTotals(entries.map((e) => ({ kcal: e.kcal })), ['kcal']).kcal;
  if (count === 0) return { status: 'not_logged', eaten: null, covered: 0, count: 0, difference: null, may_be_incomplete: false, reasons: [] };

  let status: DayStatusKind;
  if (eaten === null) status = 'unknown';
  else if (kcal_target === null || kcal_target <= 0) status = 'no_target';
  else status = targetBand(eaten, kcal_target);

  const reasons: IncompleteReason[] = [];
  if (covered < count) reasons.push('missing_values');
  if (status === 'under' || status === 'unknown' || status === 'no_target') {
    if (count < GUIDANCE_CONSTANTS.incomplete_min_entries) reasons.push('few_entries');
    const times = entries.map((e) => e.eaten_minutes).filter((m): m is number => m !== null).sort((a, b) => a - b);
    if (times.length > 0 && times[times.length - 1] < GUIDANCE_CONSTANTS.incomplete_ended_before_minute) reasons.push('ended_early');
    if (times.some((t, i) => i > 0 && t - times[i - 1] >= GUIDANCE_CONSTANTS.incomplete_gap_minutes)) reasons.push('long_gap');
  }

  return {
    status,
    eaten,
    covered,
    count,
    difference: eaten === null || status === 'no_target' ? null : eaten - (kcal_target as number),
    may_be_incomplete: reasons.length > 0,
    reasons,
  };
}

interface Candidate {
  id: string;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}
export type VerifiedCandidate = Candidate;
export type HistoryCandidate = Candidate & { uses: number; last_eaten_at: string };
export type Suggested<T> = T & { tier: 'history' | 'verified' };

const compareStrings = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function fits(c: Candidate, left: Record<RemainingKey, number | null>): boolean {
  if (left.kcal === null || c.kcal === null || c.kcal <= 0 || c.kcal > left.kcal) return false;
  for (const m of ['protein_g', 'carbs_g', 'fat_g'] as const) {
    const gap = left[m];
    const value = c[m];
    if (gap !== null && value !== null && value > Math.max(gap, 0)) return false;
  }
  return true;
}

/** Up to 3 foods that fit what is left: the user's own history first, then verified products. */
export function suggestFoods<H extends HistoryCandidate, V extends VerifiedCandidate>(
  left: Record<RemainingKey, number | null>,
  history: readonly H[],
  verified: readonly V[],
): (Suggested<H> | Suggested<V>)[] {
  if (left.kcal === null || left.kcal <= 0) return [];
  const mine = new Set(history.map((h) => h.id));
  const own = history
    .filter((h) => fits(h, left))
    .sort((a, b) => b.uses - a.uses || compareStrings(b.last_eaten_at, a.last_eaten_at) || compareStrings(a.id, b.id));
  const others = verified
    .filter((v) => !mine.has(v.id) && fits(v, left))
    .sort(
      (a, b) =>
        Number(a.protein_g === null) - Number(b.protein_g === null) ||
        (b.protein_g ?? 0) - (a.protein_g ?? 0) ||
        (a.kcal as number) - (b.kcal as number) ||
        compareStrings(a.id, b.id),
    );
  return [
    ...own.map((h): Suggested<H> => ({ ...h, tier: 'history' })),
    ...others.map((v): Suggested<V> => ({ ...v, tier: 'verified' })),
  ].slice(0, GUIDANCE_CONSTANTS.suggestion_limit);
}
