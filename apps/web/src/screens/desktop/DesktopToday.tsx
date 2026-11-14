// D_Today: calories and macros, the weight chart, the day's table, quick log and the week's bars.
// The sums come from the same domain code as the phone Today. Unknown shows as "?" and a day with
// no data has an empty state (rules 1 and 2). A target shows only when a goals row exists.
import { useState, type ReactNode } from 'react';
import { perLabel } from '../../data/products';
import type { GoalRow, LocalLogEntry, RecentFood } from '../../data/logStore';
import { roundForDisplay } from '../../domain/display';
import { MEALS } from '../../domain/entry';
import { formatNumber, formatTotal } from '../../domain/format';
import { remainingToday, weekWindow } from '../../domain/guidance';
import { rangeStart, toGoal, weightLine, weightLineFill, weightSummary, type WeightRange } from '../../domain/weight';
import { href, useApp, useData } from '../../lib/hooks';
import { DesktopShell } from '../../ui/desktop';
import { HomeIcon, UnknownChip } from '../../ui/icons-desktop-home';
import { Card, Icon, Notice, Ring, SourceBadge } from '../../ui/kit';
import { addDays, amountLabel, DIARY_GROUPS, GROUP_LABEL, longDayLabel, today, totalsOf } from '../day';
import { amountText, dayLine, weekday } from '../guidanceCopy';
import { ofText, rangeLabel } from './trendsCopy';

const MACROS = [
  { key: 'protein_g', label: 'Protein', color: 'var(--color-accent)', goal: 'protein_g_target' },
  { key: 'carbs_g', label: 'Carbs', color: 'var(--color-accent-2)', goal: 'carbs_g_target' },
  { key: 'fat_g', label: 'Fat', color: 'var(--color-accent-3)', goal: 'fat_g_target' },
  { key: 'fibre_g', label: 'Fibre', color: 'var(--color-muted)', goal: 'fibre_g_target' },
] as const;

const RANGES = ['7D', '30D', '90D'] as const satisfies readonly WeightRange[];

const QUICK_LOG_ROWS = 4;
const TABLE_COLUMNS = 'grid-cols-[minmax(0,1fr)_90px_70px_70px_70px_80px]';

/** Always one decimal, as on the board (81.0, not 81). Unknown stays "?". */
function kgText(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return '?';
  return (roundForDisplay(kg, 1) as number).toFixed(1);
}

function kgUnit(kg: number | null | undefined): string {
  return kg === null || kg === undefined ? '?' : `${kgText(kg)} kg`;
}

function signedKg(kg: number | null): string {
  if (kg === null) return '? kg';
  const rounded = roundForDisplay(kg, 1) as number;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} kg`;
}

/** "17 Oct": dayLine ("Sat 17 Oct") without its weekday. */
const shortDate = (localDate: string): string => dayLine(localDate).slice(4);

function Tile({ label, children, compact = false, testId, extra }: { label: string; children: ReactNode; compact?: boolean; testId?: string; extra?: ReactNode }) {
  return (
    <div className={`min-w-0 rounded-[14px] bg-raised px-3.5 ${compact ? 'py-2.5' : 'py-3'}`}>
      <div className="truncate text-[12px] text-secondary">{label}</div>
      <div className={`mt-0.5 flex items-center gap-1.5 font-bold ${compact ? 'text-[18px]' : 'text-[20px]'}`}>
        <span className="num" data-testid={testId}>
          {children}
        </span>
        {extra}
      </div>
    </div>
  );
}

function Gauge({ fraction, label }: { fraction: number | null; label: string }) {
  const length = Math.PI * 120;
  const filled = fraction === null ? 0 : Math.max(0, Math.min(1, fraction)) * length;
  const arc = 'M30 150 A120 120 0 0 1 270 150';
  return (
    <svg width="100%" height="190" viewBox="0 0 300 165" role="img" aria-label={label} className="block">
      <path d={arc} fill="none" stroke="var(--color-border)" strokeWidth="18" strokeLinecap="round" />
      {filled > 0 && <path d={arc} fill="none" stroke="var(--color-accent)" strokeWidth="18" strokeLinecap="round" strokeDasharray={`${filled} ${length}`} className="gauge-arc" />}
    </svg>
  );
}

function CaloriesCard({ entries, goal }: { entries: LocalLogEntry[]; goal: GoalRow | null }) {
  const totals = totalsOf(entries);
  const kcal = formatTotal(totals.kcal, 0);
  const remaining = remainingToday(totals, goal ? { kcal: goal.kcal_target } : null, ['kcal']).kcal;
  const showLeft = remaining.left !== null && remaining.exact;
  const left = remaining.left ?? 0;
  const mealsLogged = MEALS.filter((m) => entries.some((e) => e.meal === m)).length;

  return (
    <Card className="p-6">
      <div className="flex justify-between text-[13px] text-secondary">
        <span>Calories</span>
        <span>{goal ? `Goal ${formatNumber(goal.kcal_target, 0)} kcal` : 'No goal set'}</span>
      </div>
      <div className="relative mt-2">
        <Gauge
          fraction={goal && totals.kcal.value !== null ? totals.kcal.value / goal.kcal_target : null}
          label={goal ? `${kcal.text} of ${formatNumber(goal.kcal_target, 0)} kilocalories eaten` : `${kcal.text} kilocalories eaten`}
        />
        <div className="absolute inset-x-0 bottom-1.5 text-center">
          <div className="num text-[64px] font-bold leading-none tracking-[-2px]" data-testid="kcal-headline">
            {showLeft ? formatNumber(Math.abs(left), 0) : kcal.text}
          </div>
          <div className="mt-0.5 text-[14px] text-secondary">{showLeft ? (left >= 0 ? 'kcal left' : 'kcal over') : 'kcal eaten'}</div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <Tile label="Eaten" testId="kcal-eaten" extra={<UnknownChip count={kcal.unknown} what="calorie value" />}>
          {kcal.text}
        </Tile>
        <Tile label="Meals">
          <span aria-label={`${mealsLogged} of ${MEALS.length} meals logged`}>{ofText(mealsLogged, MEALS.length)}</span>
        </Tile>
        <Tile label="Items" testId="foods-logged">
          {entries.length}
        </Tile>
      </div>

      <div className="mt-[22px] grid grid-cols-2 gap-x-3 gap-y-[18px] border-t border-border pt-5">
        {MACROS.map((m) => {
          const t = totals[m.key];
          const f = formatTotal(t, t.value !== null && Math.abs(t.value) < 10 ? 1 : 0);
          const target = goal ? goal[m.goal] : null;
          return (
            <div key={m.key} className="flex items-center gap-3" data-testid={`macro-${m.key}`}>
              <div className="shrink-0">
                <Ring fraction={target && t.value !== null ? t.value / target : null} color={m.color} />
              </div>
              <div className="min-w-0">
                <div className="text-[12px] text-secondary">{m.label}</div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="num text-[17px] font-bold">
                    {f.text} <span className="text-[12px] font-medium text-secondary">{target !== null ? `/ ${formatNumber(target, 0)} g` : 'g'}</span>
                  </span>
                  <UnknownChip count={f.unknown} what={`${m.label.toLowerCase()} value`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function WeightCard({ date, weights, goal }: { date: string; weights: { local_date: string; weight_kg: number }[]; goal: GoalRow | null }) {
  const [range, setRange] = useState<WeightRange>('30D');
  const latest = weights.length > 0 ? weights[weights.length - 1] : null;
  const summary = weightSummary(weights, rangeStart(range, date, null), date);
  const line = weightLine(summary.days);
  const distance = goal ? toGoal(latest?.weight_kg ?? null, goal.target_weight_kg, goal.goal_type) : null;
  const target = goal?.target_weight_kg ?? null;
  const sub = range === 'All' ? 'all time' : rangeLabel(range);
  const middle = summary.days[Math.floor((summary.days.length - 1) / 2)];
  const weighIns = summary.days.filter((d) => d.weight_kg !== null).length;
  const fill = weightLineFill(line.segments);
  const pointsText = fill.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <Card className="flex flex-col p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] text-secondary">Weight</div>
          <div className="mt-1 flex items-baseline gap-3.5">
            <span className="num text-[44px] font-bold tracking-[-1.2px]">
              {kgText(latest?.weight_kg)} <span className="text-[18px] font-medium tracking-normal text-secondary">kg</span>
            </span>
            <span className="num text-[14px] font-semibold text-accent-2">{signedKg(line.change_kg)}</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {RANGES.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={range === r}
              aria-label={`${r}, ${rangeLabel(r)}`}
              onClick={() => setRange(r)}
              className={`tap relative flex h-8 items-center rounded-full px-3.5 text-[13px] after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] ${range === r ? 'bg-text font-bold text-ground' : 'border border-border bg-raised text-soft'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="relative mt-[18px] h-[250px]">
        <svg
          width="100%"
          height="250"
          viewBox="0 0 700 200"
          preserveAspectRatio="none"
          role="img"
          aria-label={`Daily weight, ${sub}: ${weighIns} of ${summary.days.length} days have a weigh-in.`}
          className="block overflow-visible"
        >
          {fill.length > 0 && (
            <>
              <path d={`M0,200 L${pointsText.replace(/ /g, ' L')} L700,200 Z`} fill="var(--color-accent)" fillOpacity="0.12" />
              <polyline points={pointsText} fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        {line.latest && (
          <span
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-card bg-accent"
            style={{ left: `${(line.latest.x / 700) * 100}%`, top: `${(line.latest.y / 200) * 100}%` }}
          />
        )}
        {line.segments.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            {latest === null ? (
              <a href={href('weight')} className="tap flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-ground">
                <HomeIcon name="scale" size={18} stroke={2.2} />
                Log weight
              </a>
            ) : (
              <span className="flex items-center gap-2 text-sm text-secondary">
                <HomeIcon name="scale" size={18} />
                No weigh-ins
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-2.5 flex justify-between text-[11px] text-secondary">
        <span>{summary.days[0] ? shortDate(summary.days[0].date) : ''}</span>
        <span>{middle ? shortDate(middle.date) : ''}</span>
        <span>Today</span>
      </div>

      <div className="mt-[18px] grid grid-cols-4 gap-2.5">
        <Tile label="Lowest" compact>
          {kgUnit(summary.stats.lowest_kg)}
        </Tile>
        <Tile label="Highest" compact>
          {kgUnit(summary.stats.highest_kg)}
        </Tile>
        <Tile label="Average" compact>
          {kgUnit(summary.stats.average_kg)}
        </Tile>
        <Tile label={target !== null ? `To goal ${kgText(target)}` : 'To goal'} compact>
          <span className={distance?.reached || distance?.kg != null ? 'text-accent-2' : undefined}>{distance?.reached ? 'Reached' : kgUnit(distance?.kg)}</span>
        </Tile>
      </div>
    </Card>
  );
}

function TodayTable({ date, entries }: { date: string; entries: LocalLogEntry[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-5 pb-3.5 pt-5">
        <span className="text-[17px] font-bold" title={dayLine(date)}>
          Meals
        </span>
        <a href={href('diary')} className="tap flex h-11 items-center gap-1 text-[13px] font-semibold text-accent-2">
          Open diary <Icon name="next" size={14} />
        </a>
      </div>
      {entries.length === 0 ? (
        <div className="border-t border-border px-5 py-10 text-center">
          <a href={href('add')} className="tap inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-bold text-ground">
            <Icon name="plus" size={18} stroke={2.4} />
            Add food
          </a>
        </div>
      ) : (
        <>
          <div className={`grid ${TABLE_COLUMNS} gap-2 px-5 pb-2.5 text-[11px] text-secondary`}>
            <span>Food</span>
            <span>Amount</span>
            <span className="text-right">kcal</span>
            <span className="text-right">Carbs</span>
            <span className="text-right">Fat</span>
            <span className="text-right">Protein</span>
          </div>
          {DIARY_GROUPS.map((meal) => {
            const rows = entries.filter((e) => e.meal === meal);
            if (rows.length === 0) return null;
            const total = formatTotal(totalsOf(rows).kcal, 0);
            return (
              <section key={meal} aria-label={GROUP_LABEL[meal]}>
                <div className={`grid ${TABLE_COLUMNS} items-center gap-2 border-t border-border bg-raised px-5 py-2.5`}>
                  <span className="flex items-center gap-2 text-[13px] font-bold text-soft">
                    {GROUP_LABEL[meal]}
                    {meal === 'supplements' && <HomeIcon name="daily" size={14} className="text-secondary" label="Added every day" />}
                  </span>
                  <span />
                  <span className="num text-right text-[13px] font-bold">
                    {total.text}
                    {total.unknown > 0 && ' +?'}
                  </span>
                </div>
                {rows.map((e) => (
                  <a key={e.id} href={href('entry', e.id)} className={`tap grid ${TABLE_COLUMNS} items-center gap-2 border-t border-border px-5 py-[11px] text-[14px] hover:bg-raised/60`} data-testid="today-entry">
                    <span className="flex min-w-0 items-center gap-1.5 font-semibold" title={e.name}>
                      <span className="truncate">{e.name}</span>
                      {e.server_seq === null && <HomeIcon name="notSynced" size={14} className="text-secondary" label="Not synced" />}
                    </span>
                    <span className="text-secondary">{amountLabel(e)}</span>
                    <span className="num text-right font-semibold">{formatNumber(e.kcal_total, 0)}</span>
                    <span className="num text-right text-secondary">{amountText(e.carbs_g_total, 'carbs_g')}</span>
                    <span className="num text-right text-secondary">{amountText(e.fat_g_total, 'fat_g')}</span>
                    <span className="num text-right text-secondary">{amountText(e.protein_g_total, 'protein_g')}</span>
                  </a>
                ))}
              </section>
            );
          })}
        </>
      )}
    </Card>
  );
}

/** Recent foods, one tap from a portion. Hidden until something has been logged. */
function QuickLog({ foods }: { foods: RecentFood[] }) {
  if (foods.length === 0) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[17px] font-bold">Quick log</span>
        <a href={href('add')} className="tap flex h-11 items-center text-[13px] font-semibold text-accent-2">
          All foods
        </a>
      </div>
      <ul className="mt-2 flex flex-col gap-2">
        {foods.map((f) => (
          <li key={f.product_id ?? `c:${f.custom_food_id}`}>
            <a
              href={f.product_id ? href('portion', 'product', f.product_id) : href('portion', 'custom', f.custom_food_id as string)}
              className="tap flex min-h-11 items-center gap-3 rounded-[14px] bg-raised px-3 py-2.5"
              data-testid="quick-log-row"
            >
              <div className="min-w-0 grow">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[14px] font-semibold">{f.name}</span>
                  <SourceBadge sourceName={f.source === 'custom' ? 'Your own food' : f.source} verified={f.verified === null ? null : f.verified === 1} />
                </div>
                {f.brand && <div className="mt-px truncate text-[12px] text-secondary">{f.brand}</div>}
              </div>
              <div className="shrink-0 text-right">
                {/* Rule 2: no calorie value is "?", never 0. */}
                <div className="num text-[15px] font-bold" title={f.kcal === null ? 'Calories unknown' : undefined}>
                  {formatNumber(f.kcal, 0)}
                </div>
                <div className="text-[11px] text-secondary">kcal/{perLabel(f.per_100_unit)}</div>
              </div>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-border" aria-hidden="true">
                <Icon name="plus" size={16} stroke={2.2} />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const BAR_AREA = 110;
const BAR_LABEL = 20;

/** Monday to Sunday of the week holding `date`. */
function ThisWeek({ date, entries, goal }: { date: string; entries: LocalLogEntry[]; goal: GoalRow | null }) {
  const earlier = weekWindow(date);
  const monday = earlier[0] ?? date;
  const days = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((d) => {
    const total = totalsOf(entries.filter((e) => e.local_date === d)).kcal;
    return { date: d, value: d > date ? null : total.value, unknown: total.count - total.covered, logged: total.count > 0 };
  });
  const target = goal?.kcal_target ?? null;
  const known = days.map((d) => d.value).filter((v): v is number => v !== null);
  const top = Math.max(target !== null ? target * 1.25 : 0, ...known, 1);
  const px = (v: number) => Math.max(4, Math.round((v / top) * BAR_AREA));

  const dayText = (d: (typeof days)[number]) =>
    d.date > date ? `${weekday(d.date)}: not yet` : !d.logged ? `${weekday(d.date)}: no logged meal` : `${weekday(d.date)}: ${formatNumber(d.value, 0)} kcal${d.unknown > 0 ? `, ${d.unknown} without a value` : ''}`;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-[17px] font-bold">This week</span>
        {target !== null && (
          <span className="flex items-center gap-1.5 text-[12px] text-secondary" title={`Goal ${formatNumber(target, 0)} kcal`}>
            <span aria-hidden="true" className="w-4 border-t border-dashed border-strong" />
            <span className="num">{formatNumber(target, 0)}</span>
          </span>
        )}
      </div>
      <div className="relative mt-4" role="img" aria-label={days.map(dayText).join(', ')}>
        {target !== null && <div className="absolute inset-x-0 border-t border-dashed border-strong" style={{ bottom: BAR_LABEL + px(target) }} />}
        <div className="flex items-end gap-2.5">
          {days.map((d) => (
            <div key={d.date} title={dayText(d)} className="flex h-[130px] flex-1 flex-col items-center justify-end gap-1.5">
              {d.value !== null ? (
                <div className={`w-full rounded-md ${d.date === date ? 'bg-accent' : 'bg-strong'}`} style={{ height: px(d.value) }} />
              ) : (
                <div className="h-1 w-full rounded-sm bg-border" />
              )}
              <span className={`h-3.5 text-[11px] leading-[14px] ${d.date === date ? 'text-text' : 'text-secondary'}`}>{weekday(d.date)}</span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

export function DesktopToday() {
  const app = useApp();
  const date = today();
  const { data, error } = useData(async () => {
    const monday = weekWindow(date)[0] ?? date;
    const [entries, goal, weights, week, recents] = await Promise.all([
      app.db.dayEntries(date),
      app.db.goalFor(date),
      app.db.weightHistory(),
      app.db.entriesBetween(monday, date),
      app.db.recentFoods(QUICK_LOG_ROWS),
    ]);
    return { entries, goal, weights, week, recents };
  }, [date]);

  return (
    <DesktopShell active="today" subtitle={longDayLabel(date)} title="Today">
      {error && !data && <Notice tone="error">{error}</Notice>}
      {data && (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <CaloriesCard entries={data.entries} goal={data.goal} />
            <WeightCard date={date} weights={data.weights} goal={data.goal} />
          </div>
          <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <TodayTable date={date} entries={data.entries} />
            <div className="flex flex-col gap-5">
              <QuickLog foods={data.recents} />
              <ThisWeek date={date} entries={data.week} goal={data.goal} />
            </div>
          </div>
        </>
      )}
    </DesktopShell>
  );
}
