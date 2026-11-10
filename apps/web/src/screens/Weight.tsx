// Weight (canvas boards B_Weight and B_LogWeight): latest weight, daily bars with the 7-day
// trend, the range's stats, and the entries. #/weight/log and #/weight/edit/<id> open the sheet.
// The trend maths is in domain/weight.ts. Apple Health is phone only, so its controls are left out.
import { useState } from 'react';
import { roundForDisplay } from '../domain/display';
import { chartLayout, entryDayLabel, rangeStart, signedKg, toGoal, WEIGHT_RANGES, weightSummary, type TrendDay, type WeightRange } from '../domain/weight';
import { href, useApp, useBack, useData, useRoute } from '../lib/hooks';
import { Card, Chip, Header, Icon, Notice, Page } from '../ui/kit';
import { dayLabel, today } from './day';
import { Sheet, WeightSheet } from './WeightSheet';

export function shortDate(localDate: string): string {
  const [y, m, d] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function timeIn(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
}

/** Always one decimal, as on the board (81.0, not 81). Unknown stays "?". */
export function kgText(kg: number | null | undefined): string {
  if (kg === null || kg === undefined) return '?';
  return (roundForDisplay(kg, 1) as number).toFixed(1);
}

function slotTitle(slot: { date: string; weight_kg: number | null; trend_kg: number | null }): string {
  const weight = slot.weight_kg === null ? 'no entry' : `${kgText(slot.weight_kg)} kg`;
  const trend = slot.trend_kg === null ? '' : `, trend ${kgText(slot.trend_kg)} kg`;
  return `${dayLabel(slot.date)}: ${weight}${trend}`;
}

function graphLabel(days: TrendDay[]): string {
  const missing = days.filter((d) => d.weight_kg === null).length;
  const gaps = missing === 0 ? '' : ` ${missing} ${missing === 1 ? 'day has' : 'days have'} no weigh-in and no bar.`;
  return `Daily weight for the last ${days.length} days as bars, with a 7-day trend line.${gaps}`;
}

function WeightChart({ days }: { days: TrendDay[] }) {
  const { bars, trend, slots, axis } = chartLayout(days);
  return (
    <div className="relative mt-3">
      <svg width="100%" height="116" viewBox="0 0 326 116" preserveAspectRatio="none" role="img" aria-label={graphLabel(days)} className="block">
        {axis.slice(0, -1).map((a) => (
          <line key={a.kg} x1="0" y1={a.y} x2="326" y2={a.y} stroke="var(--color-border)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        <line x1="0" y1="110" x2="326" y2="110" stroke="var(--color-border)" />
        {bars.map((b) => (
          <rect key={b.date} data-testid="weight-bar" x={b.x} y={b.y} width={b.width} height={b.height} rx="2" fill="var(--color-accent)" fillOpacity={b.latest ? 1 : 0.45} />
        ))}
        {trend.map((points) =>
          points.length > 1 ? (
            <polyline key={points[0].x} points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="var(--color-text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          ) : (
            <line key={points[0].x} x1={points[0].x} y1={points[0].y} x2={points[0].x} y2={points[0].y} stroke="var(--color-text)" strokeWidth="3" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ),
        )}
        {slots.map((s) => (
          <rect key={s.date} x={s.x} y="0" width={s.width} height="116" fill="transparent">
            <title>{slotTitle(s)}</title>
          </rect>
        ))}
      </svg>
      {axis.length > 0 && (
        <div data-testid="weight-axis" aria-hidden="true" className="pointer-events-none absolute inset-0">
          {axis.map((a) => (
            <span key={a.kg} className="absolute left-0 text-[11px] leading-none text-secondary" style={{ top: a.y - 13 }}>
              {kgText(a.kg)}
            </span>
          ))}
        </div>
      )}
      {bars.length === 0 && <p className="absolute inset-x-0 top-[46px] text-center text-sm text-secondary">No weights in this period.</p>}
    </div>
  );
}

function Stat({ label, kg }: { label: string; kg: number | null }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2.5">
      <div className="text-[11px] text-secondary">{label}</div>
      <div className="mt-0.5 text-lg font-bold">{kgText(kg)}</div>
    </div>
  );
}

export function Weight() {
  const app = useApp();
  const [, mode, id] = useRoute();
  const close = useBack('/weight');
  const [range, setRange] = useState<WeightRange>('30D');
  const day = today();
  const { data, error } = useData(async () => {
    const weights = await app.db.weightHistory();
    const goal = await app.db.goalFor(day);
    return { weights, goal };
  }, [day]);

  const weights = data?.weights ?? [];
  const latest = weights.length > 0 ? weights[weights.length - 1] : null;
  const from = rangeStart(range, day, weights.length > 0 ? weights.reduce((first, w) => (w.local_date < first ? w.local_date : first), weights[0].local_date) : null);
  const summary = weightSummary(weights, from, day);
  const trendNow = summary.days[summary.days.length - 1]?.trend_kg ?? null;
  const goal = data?.goal ?? null;
  const distance = goal ? toGoal(latest?.weight_kg ?? null, goal.target_weight_kg, goal.goal_type) : null;
  const entries = weights.filter((w) => w.local_date >= from).reverse();
  const editing = mode === 'edit' && data ? (weights.find((w) => w.id === id) ?? null) : null;

  return (
    <Page nav>
      <Header title="Weight" backLink={{ to: 'today', label: 'Back to Today' }} />

      <Card className="mt-2 p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-[13px] text-secondary">Latest</div>
            <div className="text-[44px] font-bold leading-[1.05] tracking-[-1.5px]">
              {kgText(latest?.weight_kg)}
              <span className="text-lg font-medium tracking-normal text-secondary"> kg</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold text-secondary">{signedKg(summary.change_7d_kg)} kg / 7 days</div>
            {distance?.reached && <div className="mt-0.5 text-[13px] text-accent-2">Goal reached</div>}
            {distance && !distance.reached && distance.kg !== null && <div className="mt-0.5 text-[13px] text-accent-2">{kgText(distance.kg)} kg to goal</div>}
          </div>
        </div>

        <div className="mt-2.5 flex gap-1.5">
          {WEIGHT_RANGES.map((r) => (
            <Chip key={r} compact selected={range === r} onClick={() => setRange(r)}>
              {r}
            </Chip>
          ))}
        </div>

        <WeightChart days={summary.days} />
        <div className={`mt-1.5 flex text-[11px] text-secondary ${summary.days.length > 1 ? 'justify-between' : 'justify-center'}`}>
          {summary.days.length > 1 && <span>{shortDate(from)}</span>}
          <span>Today</span>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-soft">
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[2px] bg-accent opacity-70" />
            Daily weight
          </span>
          <span className="flex items-center gap-1.5">
            <span aria-hidden="true" className="h-0.5 w-4 rounded-[1px] bg-text" />
            {trendNow === null ? '7-day trend needs 3 weigh-ins in a week' : `7-day trend ${kgText(trendNow)} kg`}
          </span>
          <span className="text-secondary">No bar: no weigh-in</span>
        </div>
      </Card>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Lowest" kg={summary.stats.lowest_kg} />
        <Stat label="Highest" kg={summary.stats.highest_kg} />
        <Stat label="Average" kg={summary.stats.average_kg} />
      </div>

      <a href={href('weight', 'log')} className="tap mt-3 flex h-[52px] items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-bold text-ground">
        <Icon name="plus" size={20} stroke={2.4} />
        Log weight
      </a>

      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      {entries.length > 0 && (
        <section className="mt-3">
          <div className="flex items-baseline justify-between pb-1.5">
            <span className="text-[15px] font-bold text-secondary">Entries</span>
          </div>
          <ul className="overflow-hidden rounded-2xl border border-border bg-card" aria-label="Weights">
            {entries.map((w, i) => {
              const when = entryDayLabel(w.local_date, day);
              const time = timeIn(w.measured_at, w.tz);
              return (
                <li key={w.id} className={i > 0 ? 'border-t border-border' : ''}>
                  <a href={href('weight', 'edit', w.id)} aria-label={`Edit weight ${kgText(w.weight_kg)} kg, ${when} ${time}`} className="tap flex min-h-12 items-center justify-between pl-4 pr-3">
                    <span className="text-[15px]">
                      {when}
                      <span className="ml-1.5 text-[13px] text-secondary">{time}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="text-[17px] font-bold">
                        {kgText(w.weight_kg)} <span className="text-[13px] font-medium text-secondary">kg</span>
                      </span>
                      <Icon name="next" size={18} stroke={2} className="text-secondary" />
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {mode === 'log' && data && <WeightSheet entry={null} suggestedKg={latest?.weight_kg ?? null} onClose={close} />}
      {editing && <WeightSheet key={editing.id} entry={editing} suggestedKg={null} onClose={close} />}
      {mode === 'edit' && data && !editing && (
        <Sheet labelId="weight-gone" onClose={close}>
          <h2 id="weight-gone" className="mt-3.5 text-xl font-bold">
            Edit weight
          </h2>
          <div className="mt-4">
            <Notice>This entry no longer exists.</Notice>
          </div>
        </Sheet>
      )}
    </Page>
  );
}
