// D_Trends (Max, 2026-11-14, mockup "Trends: one combined card"): the range (7D / 30D / 90D) at the top sets
// every card. One card holds the daily average of the picked nutrient, its bars, and the macros (triangle and
// bars); the side holds the stats, the weekday pattern (30D and 90D only) and the weight change.
// The maths is in domain/trends.ts; a day with nothing logged is left out, never counted as 0 (rule 2), and a
// partly logged or untracked day is striped and not counted (decisions 47, 48). One orange throughout: a day
// over its target is not coloured or labelled differently.
import { useState } from 'react';
import { formatNumber } from '../../domain/format';
import { barsFor, TREND_MEASURES, TREND_RANGES, TREND_RANGE_DAYS, trendsSummary, type TrendRange, type TrendsSummary } from '../../domain/trends';
import { rangeChange, signedKg, weightSummary, type WeightPoint } from '../../domain/weight';
import { href, useApp, useData } from '../../lib/hooks';
import { DesktopShell } from '../../ui/desktop';
import { CountChip, UnknownChip } from '../../ui/icons-desktop-home';
import { Card } from '../../ui/kit';
import { dayLine, weekRange, weekday } from '../guidanceCopy';
import { SKIPPED_BAR } from '../dayChoice';
import { MacroRadar, type Macro } from '../MacroRing';
import { addDays, today } from '../day';
import { averageTitle, axisLabels, coverageCount, coverageLabel, ofText, onTargetText, rangeLabel } from './trendsCopy';

// The bars ask for every day of the longest range at once, so switching range never waits on the database.
const LONGEST_RANGE = TREND_RANGE_DAYS['90D'];
const CHART_GAP: Record<TrendRange, string> = { '7D': '14px', '30D': '4px', '90D': '10px' };

const MEASURES = [
  { key: 'kcal', name: 'Calories', unit: 'kcal' },
  { key: 'protein_g', name: 'Protein', unit: 'g' },
  { key: 'carbs_g', name: 'Carbs', unit: 'g' },
  { key: 'fat_g', name: 'Fat', unit: 'g' },
] as const;
type MeasureKey = (typeof MEASURES)[number]['key'];

const MACROS: readonly { key: 'protein_g' | 'carbs_g' | 'fat_g'; k: Macro; name: string }[] = [
  { key: 'protein_g', k: 'protein', name: 'Protein' },
  { key: 'carbs_g', k: 'carbs', name: 'Carbs' },
  { key: 'fat_g', k: 'fat', name: 'Fat' },
];
/** A macro bar's full width is 125% of the target, so the target tick sits at 80%. */
const MACRO_HEADROOM = 1.25;

const percent = (value: number, top: number): string => `${(value / top) * 100}%`;
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function DesktopTrends() {
  const app = useApp();
  const day = today();
  const [range, setRange] = useState<TrendRange>('7D');
  const [measure, setMeasure] = useState<MeasureKey>('kcal');
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
  const dates = summary.window.dates;

  return (
    <DesktopShell active="trends" title="Trends">
      {error && !data && <p className="text-sm text-danger">{error}</p>}
      {data && (
        <>
          {/* The range sets every card on the page. */}
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <div className="text-[13px] text-secondary">Showing</div>
              <div className="mt-0.5 text-[18px] font-bold" data-testid="trends-range">
                {capital(rangeLabel(range))} · {weekRange(dates)}
              </div>
            </div>
            <div className="flex gap-2">
              {TREND_RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  aria-pressed={r === range}
                  aria-label={`${r}, ${rangeLabel(r)}`}
                  onClick={() => setRange(r)}
                  className={`tap relative flex h-9 items-center rounded-full px-4 text-[13px] after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] ${r === range ? 'bg-text font-bold text-ground' : 'border border-border bg-raised text-soft'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-5">
            <MainCard summary={summary} range={range} measure={measure} onMeasure={setMeasure} targets={targets} />
            <aside className="flex flex-col gap-5">
              <div className="grid grid-cols-2 gap-3">
                <Stat label="Days on target" value={onTargetText(summary.days_on_target, summary.days_judged)} testId="trends-on-target" />
                <Stat label="Days counted" value={ofText(summary.window.counted_days, dates.length)} testId="trends-logged" />
                <Stat label="Highest day" value={formatNumber(summary.highest?.kcal, 0)} title={summary.highest ? dayLine(summary.highest.local_date) : undefined} testId="trends-highest" />
                <Stat label="Lowest day" value={formatNumber(summary.lowest?.kcal, 0)} title={summary.lowest ? dayLine(summary.lowest.local_date) : undefined} testId="trends-lowest" />
              </div>
              {/* At 7D every weekday is one day, so the pattern would repeat the big chart. */}
              {range !== '7D' && <WeekdayCard summary={summary} />}
              <WeightCard weights={data.weights} day={day} range={range} />
            </aside>
          </div>
        </>
      )}
    </DesktopShell>
  );
}

function MainCard({ summary, range, measure, onMeasure, targets }: {
  summary: TrendsSummary; range: TrendRange; measure: MeasureKey; onMeasure: (m: MeasureKey) => void; targets: Record<string, number | null>;
}) {
  const info = MEASURES.find((m) => m.key === measure) ?? MEASURES[0];
  const m = summary.window.measures[measure];
  const target = targets[measure];
  const goal = target !== null && target > 0 ? target : null;
  const bars = barsFor(m.days, range, goal);
  // Day bars line up with the days, so a left-out day can keep its own height, striped.
  const dayBars = range !== '90D';
  const drawn = [...bars.map((b) => b.value), ...(dayBars ? m.days.map((d) => d.value) : [])].filter((v): v is number => v !== null);
  const top = Math.max(goal !== null ? goal * 1.25 : 0, ...drawn.map((v) => v * 1.08), 1);
  const [axis0, axis1, axis2] = axisLabels(bars, range);
  const lowerBound = m.average !== null && m.covered < m.count;
  const amount = (v: number | null) => formatNumber(v, 0);
  const described = bars.map((b) => `${dayLine(b.from)}: ${b.value === null ? 'nothing counted' : `${amount(b.value)} ${info.unit}`}`).join(', ');
  const leftOut = summary.window.left_out.length;

  return (
    <Card className="p-6">
      <div className="flex gap-2" role="group" aria-label="Nutrient">
        {MEASURES.map((x) => (
          <button
            key={x.key}
            type="button"
            aria-pressed={x.key === measure}
            onClick={() => onMeasure(x.key)}
            className={`tap relative flex h-9 items-center rounded-full px-4 text-[13px] after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] ${x.key === measure ? 'bg-text font-bold text-ground' : 'border border-border bg-raised text-soft'}`}
          >
            {x.name}
          </button>
        ))}
      </div>

      <div className="mt-4 text-[13px] text-secondary">{averageTitle(range)}</div>
      <div className="num mt-1 text-[44px] font-bold leading-none tracking-[-1.2px]" data-testid="trends-average">
        {lowerBound ? '≥ ' : ''}
        {amount(m.average)} {info.unit}
      </div>

      <div className="relative mt-9 h-56" role="img" aria-label={described}>
        <div className="absolute inset-0 flex items-end" style={{ gap: CHART_GAP[range] }}>
          {bars.map((b, i) => {
            const d = dayBars ? m.days[i] : undefined;
            if (d && d.skipped !== null && d.value !== null) {
              // Decisions 47, 48: a left-out day keeps its height, striped, and is not in the average.
              return (
                <div
                  key={b.from}
                  data-testid="trends-bar"
                  title={`${dayLine(b.from)}: ${amount(d.value)} ${info.unit}, ${d.skipped === 'auto' ? 'looks partly logged' : 'untracked'}, not counted`}
                  className="relative min-w-0 flex-1 rounded-[5px_5px_2px_2px]"
                  style={{ height: percent(d.value, top), minHeight: 2, ...SKIPPED_BAR }}
                >
                  {range === '7D' && <span className="num absolute inset-x-0 -top-[18px] text-center text-[11px] text-faint">{amount(d.value)}</span>}
                </div>
              );
            }
            if (b.value === null) {
              return <div key={b.from} data-testid="trends-bar" title={`${dayLine(b.from)}: nothing logged, left out`} className="h-[3px] min-w-0 flex-1 border-t border-dashed border-faint" />;
            }
            return (
              <div key={b.from} data-testid="trends-bar" className="relative min-w-0 flex-1 rounded-[5px_5px_2px_2px] bg-accent" style={{ height: percent(b.value, top), minHeight: 2 }}>
                {range === '7D' && <span className="num absolute inset-x-0 -top-[18px] text-center text-[11px] text-secondary">{amount(b.value)}</span>}
              </div>
            );
          })}
        </div>
        {goal !== null && (
          <>
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-faint" style={{ bottom: percent(goal, top) }} />
            <span className="num pointer-events-none absolute right-0 mb-0.5 text-[11px] text-secondary" style={{ bottom: percent(goal, top) }}>
              Goal {formatNumber(goal, 0)}
            </span>
          </>
        )}
        {summary.window.counted_days === 0 && <p className="absolute inset-x-0 top-1/3 text-center text-sm text-secondary">Nothing counted</p>}
      </div>
      <div className="mt-2.5 flex justify-between text-[11px] text-secondary">
        <span>{axis0}</span>
        <span>{axis1}</span>
        <span>{axis2}</span>
      </div>

      <div className="mt-4 flex min-h-6 flex-wrap items-center gap-[18px] text-[12px] text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px] bg-accent" />
          Counted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={SKIPPED_BAR} />
          Not counted
        </span>
        {/* Rule 2: days with nothing logged and entries with no value are counted here, never as 0. */}
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
          <UnknownChip count={m.count - m.covered} what={`${info.name.toLowerCase()} value`} />
        </span>
      </div>

      <div className="my-6 h-px bg-border" />
      <Macros summary={summary} targets={targets} />
    </Card>
  );
}

function Macros({ summary, targets }: { summary: TrendsSummary; targets: Record<string, number | null> }) {
  const rows = MACROS.map((x) => {
    const measure = summary.window.measures[x.key];
    const target = targets[x.key];
    const complete = measure.average !== null && measure.covered === measure.count;
    const share = measure.average !== null && target !== null && target > 0 ? measure.average / target : null;
    return { ...x, measure, target, share, complete };
  });
  // The triangle needs every average complete and every target, so a missing value never draws a short corner (rule 2).
  const drawable = rows.every((r) => r.complete && r.share !== null);
  return (
    <div className="grid grid-cols-[300px_minmax(0,1fr)] items-center gap-7">
      {drawable ? (
        <MacroRadar axes={rows.map((r) => ({ k: r.k, label: r.name, share: r.share as number }))} className="block w-[300px]" />
      ) : (
        <p className="flex aspect-[300/188] w-[300px] items-center justify-center px-4 text-center text-[13px] text-secondary" data-testid="radar-missing">
          The shape needs a target and full days of protein, carbs and fat.
        </p>
      )}
      <div className="flex flex-col">
        {rows.map((r) => {
          const covered = coverageCount(r.measure);
          const width = r.share === null ? 0 : Math.min(100, (r.share / MACRO_HEADROOM) * 100);
          return (
            <div key={r.key} className="grid grid-cols-[70px_minmax(0,1fr)_108px_48px] items-center gap-3.5 py-2.5" data-testid={`trends-macro-${r.key}`}>
              <span className="text-[14px] font-semibold">{r.name}</span>
              <div className="relative h-2.5 rounded-[5px] bg-border">
                <div className="h-2.5 rounded-[5px] bg-accent" style={{ width: `${width}%` }} />
                {r.target !== null && <span className="absolute -top-[3px] h-4 w-0.5 rounded-sm bg-text opacity-50" style={{ left: `${100 / MACRO_HEADROOM}%` }} aria-hidden="true" />}
              </div>
              <span className="num text-right text-[14px]">
                <b>{r.measure.average === null ? '?' : `${r.measure.covered < r.measure.count ? '≥' : ''}${formatNumber(r.measure.average, 0)} g`}</b>{' '}
                <span className="text-secondary">{r.target === null ? '' : `/ ${formatNumber(r.target, 0)}`}</span>
              </span>
              <span className="num flex justify-end text-[14px] text-secondary">
                {covered !== '' ? (
                  <CountChip icon="unknown" tone="warn" label={coverageLabel(r.name, r.measure)} testId="trends-macro-coverage">
                    {covered}
                  </CountChip>
                ) : r.share === null ? (
                  ''
                ) : (
                  `${formatNumber(r.share * 100, 0)}%`
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
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
    <section className="card p-[22px]" data-testid="trends-weekdays">
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold">Weekday pattern</h2>
        <span className="text-[12px] text-secondary">kcal</span>
      </div>
      <div className="mt-4 flex h-[130px] items-end gap-2.5" role="img" aria-label={described}>
        {summary.weekdays.map((d) => (
          <div key={d.label} className="flex h-[130px] flex-1 flex-col items-center justify-end gap-1.5">
            {d.average !== null && <div className="w-full rounded-[5px] bg-accent" style={{ height: percent(d.average, summary.top), minHeight: 2 }} />}
            <span className="text-[11px] text-secondary">{d.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** The weight change over the range, its weekly rate, and the weigh-ins as a line (first and last labelled below). */
function WeightCard({ weights, day, range }: { weights: WeightPoint[]; day: string; range: TrendRange }) {
  const days = TREND_RANGE_DAYS[range];
  const from = addDays(day, 1 - days);
  // Last weigh-in minus first inside the range, the two numbers labelled under the graph.
  const range_ = rangeChange(weights, from, day);
  const change = range_?.change ?? null;
  const rate = range_?.per_week ?? null;
  const points = weightSummary(weights, from, day).days.flatMap((d, i) => (d.weight_kg === null ? [] : [{ i, date: d.date, kg: d.weight_kg }]));
  const W = 260;
  const H = 78;
  const PAD = 10;
  const lo = Math.min(...points.map((p) => p.kg));
  const hi = Math.max(...points.map((p) => p.kg));
  const span = Math.max(hi - lo, 0.4);
  const xy = points.map((p) => ({ ...p, x: PAD + (p.i / Math.max(days - 1, 1)) * (W - 2 * PAD), y: 16 + ((hi - p.kg) / span) * (H - 34) }));
  const first = xy[0];
  const last = xy[xy.length - 1];
  return (
    <a
      href={href('weight')}
      aria-label={`Weight change, ${rangeLabel(range)}: ${change === null ? 'not enough weigh-ins' : `${signedKg(change)} kg`}`}
      className="card tap block p-[22px]"
    >
      <div className="text-[12px] text-secondary">Weight change, {rangeLabel(range)}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="num text-[30px] font-bold tracking-[-0.6px]" data-testid="trends-weight">
          {change === null ? '?' : `${signedKg(change)} kg`}
        </span>
        {rate !== null && <span className="num text-[13px] text-secondary">≈ {signedKg(rate)} kg / week</span>}
      </div>
      {xy.length >= 2 && (
        <>
          {/* Like the Weight page: a line with a soft fill, edge to edge in a dark box; the end dots sit just inside. */}
          <div className="mt-3 overflow-hidden rounded-[14px] border border-border bg-[#08080a]">
            <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label={`Weigh-ins from ${formatNumber(first.kg, 1)} kg to ${formatNumber(last.kg, 1)} kg`}>
              <path d={`M0,${H} L0,${first.y} ${xy.map((p) => `L${p.x},${p.y}`).join(' ')} L${W},${last.y} L${W},${H} Z`} fill="var(--color-accent)" fillOpacity="0.12" />
              <polyline points={`0,${first.y} ${xy.map((p) => `${p.x},${p.y}`).join(' ')} ${W},${last.y}`} fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {xy.map((p) => (
                <circle key={p.date} cx={p.x} cy={p.y} r="2.5" fill="var(--color-accent)" />
              ))}
            </svg>
          </div>
          <div className="mt-2 flex justify-between text-[12px] text-secondary">
            <span className="num">
              <b className="font-semibold text-soft">{formatNumber(first.kg, 1)} kg</b> · {weekday(first.date)} {Number(first.date.slice(8))}
            </span>
            <span className="num">
              <b className="font-semibold text-soft">{formatNumber(last.kg, 1)} kg</b> · {weekday(last.date)} {Number(last.date.slice(8))}
            </span>
          </div>
        </>
      )}
    </a>
  );
}
