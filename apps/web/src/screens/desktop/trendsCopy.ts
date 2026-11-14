// The words and number formats of the desktop home screens (Trends, and the short counts of Today and Diary).
// Rounding goes through the shared display rule; unknown shows as "?" and is never printed as 0 (rule 2).
import { roundForDisplay } from '../../domain/display';
import { formatNumber } from '../../domain/format';
import type { WeeklyAverage } from '../../domain/guidance';
import { TREND_RANGE_DAYS, type TrendBar, type TrendRange } from '../../domain/trends';
import { dayLine, weekday } from '../guidanceCopy';

/** The chart title. The range chip says how long; 90D bars are whole weeks. */
export function averageTitle(range: TrendRange): string {
  return range === '90D' ? 'Daily average, by week' : 'Daily average';
}

export function rangeLabel(range: TrendRange): string {
  return `last ${TREND_RANGE_DAYS[range]} days`;
}

/** "232 under goal". When some entries have no value the true figure can only be nearer or further. */
export function vsGoalText({ average, target, covered, count }: { average: number | null; target: number | null; covered: number; count: number }): string {
  if (average === null) return '';
  if (target === null || target <= 0) return 'No goal set';
  // From the rounded average, so the number shown beside it adds up to the goal.
  const difference = (roundForDisplay(average, 0) as number) - target;
  const size = formatNumber(Math.abs(difference), 0);
  if (size === '0') return 'On goal';
  const over = difference > 0;
  const bound = covered < count ? (over ? '≥ ' : '≤ ') : '';
  return `${bound}${size} ${over ? 'over' : 'under'} goal`;
}

/** First, middle and last label under the chart: "Sun 11" on 7D, "2 Oct" on the longer ranges. */
export function axisLabels(bars: readonly TrendBar[], range: TrendRange): [string, string, string] {
  const label = (date: string) => {
    const [weekday, day, month] = dayLine(date).split(' ');
    return range === '7D' ? `${weekday} ${day}` : `${day} ${month}`;
  };
  return [label(bars[0].from), label(bars[Math.floor((bars.length - 1) / 2)].from), 'Today'];
}

/** "4/7". Unknown with no goal, or with no day to judge, so it never reads as 0 days. */
export function onTargetText(onTarget: number | null, judged: number): string {
  return onTarget === null || judged === 0 ? '?' : `${onTarget}/${judged}`;
}

/** "5/7": a count out of a whole, for the compact chips. */
export const ofText = (part: number, whole: number): string => `${part}/${whole}`;

/** "0/5" when some entries have no value for a measure, or nothing when every entry has one. */
export function coverageCount(m: { covered: number; count: number }): string {
  return m.count === 0 || m.covered === m.count ? '' : ofText(m.covered, m.count);
}

/** The full meaning of a coverage count, for screen readers and hover. */
export function coverageLabel(name: string, m: { covered: number; count: number }): string {
  return `${name}: ${m.covered} of ${m.count} entries have a value; the others are left out, not counted as 0`;
}

/** The full meaning of the days chip of a weekly average: "4 of 5 days counted, Tue left out". */
export function daysLabel(week: Pick<WeeklyAverage, 'counted_days' | 'dates' | 'left_out'> & { skipped?: WeeklyAverage['skipped'] }): string {
  const head = `${week.counted_days} of ${week.dates.length} days counted`;
  const parts = [week.left_out.length === 0 ? head : `${head}, ${week.left_out.map(weekday).join(', ')} not logged and left out`];
  // Decision 47: logged days that are not counted, and why.
  const skipped = week.skipped ?? [];
  const auto = skipped.filter((s) => s.why === 'auto').map((s) => weekday(s.local_date));
  const user = skipped.filter((s) => s.why === 'user').map((s) => weekday(s.local_date));
  if (auto.length > 0) parts.push(`${auto.join(', ')} partly logged and left out`);
  if (user.length > 0) parts.push(`${user.join(', ')} untracked`);
  return parts.join('; ');
}
