// The words and number formats of the guidance cards. Neutral language: no praise, no blame.
// Rounding goes through formatNumber; unknown shows as "?" and is never printed as 0 (rule 2).
import { formatNumber } from '../domain/format';
import type { Meal } from '../domain/entry';
import type { Nutrient } from '../domain/nutrients';
import type { DayStatus, DayStatusKind, RemainingValue, Verdict, WeeklyAverage, WeeklyMeasure, WeeklyMeasureKey } from '../domain/guidance';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(localDate: string): { weekday: string; day: number; month: string } {
  const [y, m, d] = localDate.split('-').map(Number);
  return { weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()], day: d, month: MONTHS[m - 1] };
}

export const weekday = (localDate: string): string => parts(localDate).weekday;

export function dayLine(localDate: string): string {
  const p = parts(localDate);
  return `${p.weekday} ${p.day} ${p.month}`;
}

export function weekRange(dates: readonly string[]): string {
  if (dates.length === 0) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (first === last) return dayLine(first);
  const a = parts(first);
  const b = parts(last);
  return a.month === b.month ? `${a.weekday} ${a.day} to ${b.weekday} ${b.day} ${b.month}` : `${dayLine(first)} to ${dayLine(last)}`;
}

function joinDays(names: readonly string[]): string {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function leftOutNote(week: WeeklyAverage): string {
  const head = `${week.counted_days} of ${week.dates.length} days counted.`;
  if (week.left_out.length === 0) return head;
  const one = week.left_out.length === 1;
  return `${head} ${joinDays(week.left_out.map(weekday))} had no logged meal and ${one ? 'is' : 'are'} left out.`;
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  on_target: 'On target',
  a_bit_under: 'A bit under',
  well_under: 'Well under',
  above_target: 'Above target',
};

const digitsFor = (key: string, value: number | null): number => (key !== 'kcal' && value !== null && Math.abs(value) < 10 ? 1 : 0);

export function amountText(value: number | null, key: string): string {
  return formatNumber(value, digitsFor(key, value));
}

export function weeklyHeadline(m: WeeklyMeasure, key: WeeklyMeasureKey): { caption: string; value: string } {
  if (m.average === null) return { caption: 'No values logged', value: '?' };
  return { caption: m.covered < m.count ? 'At least, per logged day' : 'Average per logged day', value: amountText(m.average, key) };
}

const VALUE_NAME: Record<Nutrient, string> = {
  kcal: 'calorie',
  protein_g: 'protein',
  carbs_g: 'carb',
  fat_g: 'fat',
  fibre_g: 'fibre',
  sat_fat_g: 'saturated fat',
  sugars_g: 'sugar',
  salt_g: 'salt',
};

export function coverageNote(m: WeeklyMeasure, key: Nutrient): string {
  if (m.count === 0) return '';
  if (m.covered === m.count) return m.count === 1 ? 'Covers the 1 entry.' : `Covers all ${m.count} entries.`;
  const others = m.count - m.covered;
  const verb = others === 1 ? 'has' : 'have';
  const be = others === 1 ? 'is' : 'are';
  const byDay = m.days
    .filter((d) => d.logged && d.covered < d.count)
    .map((d) => `${weekday(d.local_date)} ${d.covered} of ${d.count}`)
    .join(', ');
  return `Covers ${m.covered} of ${m.count} entries. The other ${others} ${verb} no ${VALUE_NAME[key]} value and ${be} left out, not counted as 0. By day: ${byDay}.`;
}

/** The Today row. null when there is nothing to report: an unlogged day is never treated as a fast. */
export function dayStatusLine(s: DayStatus, confirmedComplete = false): string | null {
  if (s.status === 'not_logged' || s.status === 'no_target') return null;
  const title = dayEndTitle(s.status);
  return s.may_be_incomplete && !confirmedComplete ? `${title}, may be incomplete` : title;
}

export function dayEndTitle(status: DayStatusKind): string {
  const titles: Record<DayStatusKind, string> = {
    on_target: 'On target',
    under: 'Under target',
    over: 'Over target',
    unknown: 'Calories unknown',
    no_target: 'No goal set',
    not_logged: 'Nothing logged',
  };
  return titles[status];
}

/** "1,090 kcal under". When an entry has no value the true figure can only be nearer or further. */
export function differenceText(s: DayStatus): string {
  if (s.difference === null) return '';
  const size = formatNumber(Math.abs(s.difference), 0);
  if (size === '0') return '';
  const over = s.difference > 0;
  const bound = s.covered < s.count ? (over ? '≥ ' : '≤ ') : '';
  return `${bound}${size} kcal ${over ? 'over' : 'under'}`;
}

const clock = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const MEAL_ORDER: readonly Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_WORD: Record<Meal, string> = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', snack: 'snacks' };

function joinWords(words: readonly string[]): string {
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/** The body of the "may be incomplete" card: what the log shows, in plain words. */
export function incompleteText({ status, meals, lastMinutes }: { status: DayStatus; meals: readonly Meal[]; lastMinutes: number | null }): string {
  const sentences: string[] = [];
  const { reasons, count, covered } = status;

  if (reasons.some((r) => r !== 'missing_values')) {
    const clauses: string[] = [];
    if (reasons.includes('ended_early') && lastMinutes !== null) clauses.push(`nothing after ${clock(lastMinutes)}`);
    if (!meals.includes('dinner')) clauses.push('there is no dinner');
    if (reasons.includes('long_gap')) clauses.push('there is a long gap between entries');

    if (clauses.length > 0) {
      const names = MEAL_ORDER.filter((m) => meals.includes(m)).map((m) => MEAL_WORD[m]);
      const list = joinWords(names);
      const verb = names.length === 1 && names[0] !== 'snacks' ? 'is' : 'are';
      const rest = clauses.length === 1 ? `and ${clauses[0]}` : `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}`;
      sentences.push(`${list.charAt(0).toUpperCase()}${list.slice(1)} ${verb} logged, ${rest}.`);
    } else {
      sentences.push(count === 1 ? 'Only 1 entry is logged.' : `Only ${count} entries are logged.`);
    }
  }
  if (reasons.includes('missing_values')) {
    const without = count - covered;
    sentences.push(`${without} of ${count} ${count === 1 ? 'entry' : 'entries'} ${without === 1 ? 'has' : 'have'} no calorie value.`);
  }
  sentences.push('A day with missing entries is never counted as fasting, so the totals above show only what was logged.');
  return sentences.join(' ');
}

export function remainingText(r: RemainingValue, key: string): { value: string; over: boolean } {
  if (r.left === null) return { value: '?', over: false };
  const over = r.left < 0;
  const bound = r.exact ? '' : over ? '≥ ' : '≤ ';
  const text = amountText(Math.abs(r.left), key);
  return { value: `${bound}${text}${key === 'kcal' ? '' : ' g'}`, over };
}
