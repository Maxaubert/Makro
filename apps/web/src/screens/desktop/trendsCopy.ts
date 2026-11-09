// The words and number formats of D_Trends. Rounding goes through the shared display rule;
// unknown shows as "?" and is never printed as 0 (rule 2).
import { roundForDisplay } from '../../domain/display';
import { formatNumber } from '../../domain/format';
import { TREND_RANGE_DAYS, type TrendBar, type TrendRange } from '../../domain/trends';
import { dayLine } from '../guidanceCopy';

export function averageTitle(range: TrendRange): string {
  return `Average intake, last ${TREND_RANGE_DAYS[range]} days${range === '90D' ? ' (weekly)' : ''}`;
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

/** "4 of 7". Unknown with no goal, or with no day to judge, so it never reads as 0 days. */
export function onTargetText(onTarget: number | null, judged: number): string {
  return onTarget === null || judged === 0 ? '?' : `${onTarget} of ${judged}`;
}

/** "Fibre covers 2 of 6 entries.", or nothing when every entry has a value. */
export function coverageLine(name: string, m: { covered: number; count: number }): string {
  return m.count === 0 || m.covered === m.count ? '' : `${name} covers ${m.covered} of ${m.count} entries.`;
}
