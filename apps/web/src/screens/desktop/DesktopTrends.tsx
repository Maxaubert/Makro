// D_Trends: average intake against the goal over 7, 30 or 90 days, the weekday pattern, the macros and the
// weight change. The maths is in domain/trends.ts; a day with nothing logged is left out, never counted as 0.
import { useState } from 'react';
import { formatNumber } from '../../domain/format';
import { TREND_MEASURES, TREND_RANGES, TREND_RANGE_DAYS, trendsSummary, type TrendBand, type TrendRange, type TrendsSummary } from '../../domain/trends';
import { signedKg, trendChange } from '../../domain/weight';
import { href, useApp, useData } from '../../lib/hooks';
import { DesktopShell } from '../../ui/desktop';
import { CountChip, HomeIcon, UnknownChip } from '../../ui/icons-desktop-home';
import { Card, Icon } from '../../ui/kit';
import { dayLine } from '../guidanceCopy';
import { SKIPPED_BAR } from '../dayChoice';
import { addDays, today } from '../day';
import { averageTitle, axisLabels, coverageCount, coverageLabel, ofText, onTargetText, rangeLabel, vsGoalText } from './trendsCopy';

// The bars ask for every day of the longest range at once, so switching range never waits on the database.
const LONGEST_RANGE = TREND_RANGE_DAYS['90D'];

const BAND_COLOR: Record<TrendBand, string> = { on_target: '#FF4C00', over: '#FF8A57', under: '#36363B' };
/** With no goal a bar is neither on, over nor under. */
const NO_GOAL_COLOR = '#7C7C84';

const CHART_GAP: Record<TrendRange, string> = { '7D': '14px', '30D': '4px', '90D': '10px' };

const MACROS = [
  { key: 'protein_g', name: 'Protein', color: '#FF4C00' },
  { key: 'carbs_g', name: 'Carbs', color: '#FF8A57' },
  { key: 'fat_g', name: 'Fat', color: '#FFB38F' },
  { key: 'fibre_g', name: 'Fibre', color: '#7A7A80' },
] as const;

const percent = (value: number, top: number): string => `${(value / top) * 100}%`;

export function DesktopTrends() {
  const app = useApp();
  const day = today();
  const [range, setRange] = useState<TrendRange>('7D');
  const { data, error } = useData(async () => {
    const [entries, goal, weights, choices] = await Promise.all([
      app.db.entriesBetween(addDays(day, 1 - LONGEST_RANGE), day),
      app.db.goalFor(day),
      app.db.weightHistory(),
      app.db.dayChoices(addDays(day, 1 - LONGEST_RANGE), day),
    ]);
    return { entries, goal, weights, choices };
  }, [day]);

  const targets = {
    kcal: data?.goal?.kcal_target ?? null,
    protein_g: data?.goal?.protein_g_target ?? null,
    carbs_g: data?.goal?.carbs_g_target ?? null,
    fat_g: data?.goal?.fat_g_target ?? null,
    fibre_g: data?.goal?.fibre_g_target ?? null,
  };

  const byDate = new Map<string, (typeof targets)[]>();
  for (const e of data?.entries ?? []) {
    const item = Object.fromEntries(TREND_MEASURES.map((n) => [n, e[`${n}_total`]])) as typeof targets;
    byDate.set(e.local_date, [...(byDate.get(e.local_date) ?? []), item]);
  }
  const summary = trendsSummary({ today: day, range, targets, choices: data?.choices, days: [...byDate].map(([local_date, items]) => ({ local_date, items })) });
  const weightChange = trendChange(data?.weights ?? [], day, TREND_RANGE_DAYS[range]);

  return (
    <DesktopShell active="trends" title="Trends">
      {error && !data && <p className="text-sm text-danger">{error}</p>}
      {data && (
        <div className="grid grid-cols-[minmax(0,1fr)_380px] items-start gap-5">
          <section className="flex min-w-0 flex-col gap-5">
            <AverageCard summary={summary} range={range} target={targets.kcal} onRange={setRange} />
            <MacrosCard summary={summary} targets={targets} />
          </section>
          <aside className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Days on target" value={onTargetText(summary.days_on_target, summary.days_judged)} testId="trends-on-target" />
              <Stat label="Days counted" value={ofText(summary.window.counted_days, summary.window.dates.length)} testId="trends-logged" />
              <Stat label="Highest day" value={formatNumber(summary.highest?.kcal, 0)} title={summary.highest ? dayLine(summary.highest.local_date) : undefined} testId="trends-highest" />
              <Stat label="Lowest day" value={formatNumber(summary.lowest?.kcal, 0)} title={summary.lowest ? dayLine(summary.lowest.local_date) : undefined} testId="trends-lowest" />
            </div>
            <WeekdayCard summary={summary} />
            <a
              href={href('weight')}
              aria-label={`Weight change, ${rangeLabel(range)}: ${weightChange === null ? 'not enough weigh-ins' : `${signedKg(weightChange)} kg`}`}
              className="card tap flex items-center gap-3.5 p-[22px]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-raised text-soft">
                <HomeIcon name="scale" size={22} />
              </span>
              <div className="grow">
                <div className="text-[12px] text-secondary">Weight</div>
                <div className="num mt-0.5 text-[26px] font-bold" data-testid="trends-weight">
                  {weightChange === null ? '?' : `${signedKg(weightChange)} kg`}
                </div>
              </div>
              <Icon name="next" size={18} className="shrink-0 text-secondary" />
            </a>
          </aside>
        </div>
      )}
    </DesktopShell>
  );
}

function AverageCard({ summary, range, target, onRange }: { summary: TrendsSummary; range: TrendRange; target: number | null; onRange: (r: TrendRange) => void }) {
  const kcal = summary.window.measures.kcal;
  const goal = target !== null && target > 0 ? target : null;
  const [axis0, axis1, axis2] = axisLabels(summary.bars, range);
  const leftOut = summary.window.left_out.length;
  const unknown = kcal.count - kcal.covered;
  const described = summary.bars
    .map((b) => `${dayLine(b.from)}: ${b.value === null ? 'nothing logged' : `${formatNumber(b.value, 0)} kcal`}`)
    .join(', ');

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[13px] text-secondary">{averageTitle(range)}</div>
          <div className="mt-0.5 flex items-baseline gap-2.5">
            <span className="num text-[40px] font-bold tracking-[-1.2px]" data-testid="trends-average">
              {formatNumber(kcal.average, 0)} kcal
            </span>
            <span className="text-[15px] text-secondary" data-testid="trends-vs-goal">
              {vsGoalText({ average: kcal.average, target, covered: kcal.covered, count: kcal.count })}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {TREND_RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={r === range}
              aria-label={`${r}, ${rangeLabel(r)}`}
              onClick={() => onRange(r)}
              className={`tap relative flex h-8 items-center rounded-full px-3.5 text-[13px] after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] ${r === range ? 'bg-text font-bold text-ground' : 'border border-border bg-raised text-soft'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-[22px] h-60" role="img" aria-label={described}>
        <div className="absolute inset-0 flex items-end" style={{ gap: CHART_GAP[range] }}>
          {summary.bars.map((b) => {
            // Decision 47: a day bar of a left-out day keeps its height, striped, and is not in the average.
            const skippedDay = b.from === b.to ? kcal.days.find((d) => d.local_date === b.from && d.skipped !== null && d.value !== null) : undefined;
            if (skippedDay) {
              return (
                <div
                  key={b.from}
                  data-testid="trends-bar"
                  title={`${dayLine(b.from)}: ${formatNumber(skippedDay.value, 0)} kcal, ${skippedDay.skipped === 'auto' ? 'looks partly logged' : 'untracked'}, not counted`}
                  className="min-w-0 flex-1 rounded-[5px_5px_2px_2px]"
                  style={{ height: percent(skippedDay.value as number, summary.top), minHeight: 2, ...SKIPPED_BAR }}
                />
              );
            }
            return (
              <div
                key={b.from}
                data-testid="trends-bar"
                title={b.value === null ? `${dayLine(b.from)}: nothing logged, left out` : undefined}
                className={`min-w-0 flex-1 ${b.value === null ? 'h-[3px] border-t border-dashed border-faint' : 'rounded-[5px_5px_2px_2px]'}`}
                style={b.value === null ? undefined : { height: percent(b.value, summary.top), minHeight: 2, background: b.band ? BAND_COLOR[b.band] : NO_GOAL_COLOR }}
              />
            );
          })}
        </div>
        {goal !== null && (
          <>
            <div className="absolute inset-x-0 border-t border-dashed border-faint" style={{ bottom: percent(goal, summary.top) }} />
            <span className="num absolute right-0 text-[11px] text-secondary" style={{ bottom: percent(goal, summary.top) }}>
              Goal {formatNumber(goal, 0)}
            </span>
          </>
        )}
        {summary.window.counted_days === 0 && <p className="absolute inset-x-0 top-1/3 text-center text-sm text-secondary">Nothing logged</p>}
      </div>

      <div className="mt-2.5 flex justify-between text-[11px] text-secondary">
        <span>{axis0}</span>
        <span>{axis1}</span>
        <span>{axis2}</span>
      </div>

      <div className="mt-4 flex min-h-6 flex-wrap items-center gap-[18px] text-[12px] text-secondary">
        {goal !== null && (
          <>
            <span title="Within 10% of the goal">
              <LegendDot color={BAND_COLOR.on_target} label="On target" />
            </span>
            <LegendDot color={BAND_COLOR.over} label="Over" />
            <LegendDot color={BAND_COLOR.under} label="Under" />
          </>
        )}
        {/* Rule 2: a day with nothing logged is a dashed stub and is counted here; so are entries with no value. */}
        <span className="ml-auto flex gap-2" data-testid="trends-coverage">
          {leftOut > 0 && (
            <CountChip icon="calendar" label={`${leftOut} ${leftOut === 1 ? 'day' : 'days'} with nothing logged, left out, not counted as 0`}>
              {leftOut}
            </CountChip>
          )}
          {summary.window.skipped.length > 0 && (
            <CountChip icon="calendar" tone="warn" label={`${summary.window.skipped.length} logged ${summary.window.skipped.length === 1 ? 'day is' : 'days are'} not counted: partly logged or untracked. Track or untrack a day on the Diary.`} testId="trends-skipped">
              {summary.window.skipped.length}
            </CountChip>
          )}
          <UnknownChip count={unknown} what="calorie value" />
        </span>
      </div>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}

function MacrosCard({ summary, targets }: { summary: TrendsSummary; targets: Record<string, number | null> }) {
  return (
    <Card className="p-6">
      <h2 className="text-[17px] font-bold">Macros</h2>
      <div className="mt-5 flex flex-col gap-[18px]">
        {MACROS.map((m) => {
          const measure = summary.window.measures[m.key];
          const average = measure.average;
          const covered = coverageCount(measure);
          const target = targets[m.key];
          const pct = average !== null && target !== null && target > 0 ? Math.min(100, Math.round((average / target) * 100)) : 0;
          return (
            <div key={m.key} className="grid grid-cols-[90px_minmax(0,1fr)_120px_64px] items-center gap-4" data-testid={`trends-macro-${m.key}`}>
              <span className="text-[14px] font-semibold">{m.name}</span>
              <div className="h-2.5 rounded-[5px] bg-border">
                <div className="h-2.5 rounded-[5px]" style={{ width: `${pct}%`, background: m.color }} />
              </div>
              <span className="num text-right text-[14px]">
                <b>{average === null ? '?' : `${formatNumber(average, 0)} g`}</b>{' '}
                <span className="text-secondary">{target === null ? '' : `/ ${formatNumber(target, 0)}`}</span>
              </span>
              <span className="flex justify-end">
                {covered !== '' && (
                  <CountChip icon="unknown" tone="warn" label={coverageLabel(m.name, measure)} testId="trends-macro-coverage">
                    {covered}
                  </CountChip>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function Stat({ label, value, title, testId }: { label: string; value: string; title?: string; testId: string }) {
  return (
    <Card className="p-[18px]">
      <div className="text-[12px] text-secondary">{label}</div>
      <div className="num mt-1 text-[28px] font-bold" title={title} data-testid={testId}>
        {value}
      </div>
    </Card>
  );
}

function WeekdayCard({ summary }: { summary: TrendsSummary }) {
  const described = summary.weekdays.map((d) => `${d.label}: ${d.average === null ? 'nothing logged' : `${formatNumber(d.average, 0)} kcal`}`).join(', ');
  return (
    <Card className="p-[22px]">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold">Weekday pattern</h2>
        <span className="text-[12px] text-secondary">kcal</span>
      </div>
      <div className="mt-4 flex h-[130px] items-end gap-2.5" role="img" aria-label={described}>
        {summary.weekdays.map((d) => (
          <div key={d.label} className="flex h-[130px] flex-1 flex-col items-center justify-end gap-1.5">
            {d.average !== null && (
              <div className="w-full rounded-[5px]" style={{ height: percent(d.average, summary.top), minHeight: 2, background: d.over ? '#FF8A57' : '#FF4C00' }} />
            )}
            <span className="text-[11px] text-secondary">{d.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
