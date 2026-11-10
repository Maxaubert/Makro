// D_Weight: line chart with ranges and stats, the weigh-ins table, and the log and goal panels.
// The maths is in domain/weight.ts; #/weight/log and #/weight/edit/<id> open the phone's sheet.
// Apple Health is phone only, so its toggle is left out.
import { useEffect, useState, type ReactNode } from 'react';
import { buildWeightEntry } from '../../domain/entry';
import { browserTimeZone } from '../../domain/localDate';
import { goalEstimate, rangeStart, signedKg, toGoal, weighInChanges, weightLine, weightLineGaps, weightLineTicks, weightSummary, type TrendDay, type WeightRange } from '../../domain/weight';
import { roundForDisplay } from '../../domain/display';
import { WEIGHT_RANGE_KG } from '../../domain/goals';
import { href, useApp, useBack, useData, useRoute } from '../../lib/hooks';
import { DesktopShell } from '../../ui/desktop';
import { Icon, Notice } from '../../ui/kit';
import { dayLabel, today } from '../day';
import { kgText, shortDate, timeIn } from '../Weight';
import { parseKg, Sheet, steppedKgText, toLocalInput, WeightSheet, whenLabel } from '../WeightSheet';

const RANGES: { id: WeightRange; sub: string }[] = [
  { id: '7D', sub: 'last 7 days' },
  { id: '30D', sub: 'last 30 days' },
  { id: '90D', sub: 'last 90 days' },
];

const CARD = 'rounded-[20px] border border-border bg-card';
const CHANGE_GRID = 'grid grid-cols-[minmax(0,1fr)_110px_110px_140px] gap-2';

const withUnit = (kg: number | null) => (kg === null ? '?' : `${kgText(kg)} kg`);

function WeightChart({ days }: { days: TrendDay[] }) {
  const { segments: stretches, latest } = weightLine(days);
  const bridges = weightLineGaps(stretches);
  const ticks = weightLineTicks(days);
  const known = days.filter((d) => d.weight_kg !== null).length;
  const middle = days[Math.floor(days.length / 2)];
  return (
    <>
      <div className="relative mt-5 h-[270px] pl-11">
        {ticks.map((t) => (
          <div key={t.top}>
            <div className="absolute inset-x-0 border-t border-dashed border-border" style={{ top: `${t.top}%` }} />
            <span className="solid absolute left-0 -translate-y-1/2 bg-card pr-1.5 text-[11px] text-secondary" style={{ top: `${t.top}%` }}>
              {kgText(t.kg)}
            </span>
          </div>
        ))}
        <div className="relative h-[270px]">
          <svg width="100%" height="270" viewBox="0 0 700 200" preserveAspectRatio="none" role="img" aria-label={`Weight over time. ${known} of ${days.length} days have a weigh-in.`} className="block overflow-visible">
            {stretches
              .filter((s) => s.length > 1)
              .map((s) => (
                <path key={s[0].x} d={`M${s[0].x.toFixed(1)},200 L${s.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L')} L${s[s.length - 1].x.toFixed(1)},200 Z`} fill="var(--color-accent)" fillOpacity="0.12" />
              ))}
            {bridges.map(([a, b]) => (
              <line key={a.x} data-testid="weight-gap" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-accent)" strokeOpacity="0.5" strokeWidth="2" strokeDasharray="3 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            ))}
            {stretches.map((s) =>
              s.length > 1 ? (
                <polyline key={s[0].x} points={s.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ) : (
                <line key={s[0].x} x1={s[0].x} y1={s[0].y} x2={s[0].x} y2={s[0].y} stroke="var(--color-accent)" strokeWidth="6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              ),
            )}
          </svg>
          {latest && (
            <span
              aria-hidden="true"
              className="absolute h-[18px] w-[18px] -translate-y-1/2 rounded-full border-[3px] border-card bg-accent"
              style={{ left: `calc(${(latest.x / 700) * 100}% - 9px)`, top: `${(latest.y / 200) * 100}%` }}
            />
          )}
          {known === 0 && <p className="absolute inset-x-0 top-[124px] text-center text-sm text-secondary">No weights in this period.</p>}
        </div>
      </div>
      <div className="ml-11 mt-2.5 flex justify-between text-[11px] text-secondary">
        <span>{shortDate(days[0].date)}</span>
        <span>{shortDate(middle.date)}</span>
        <span>Today</span>
      </div>
    </>
  );
}

function Stat({ label, accent, children }: { label: string; accent?: boolean; children: ReactNode }) {
  return (
    <div className="rounded-[14px] bg-raised px-3.5 py-3">
      <div className="text-[12px] text-secondary">{label}</div>
      <div className={`mt-0.5 text-[19px] font-bold ${accent ? 'text-accent-2' : ''}`}>{children}</div>
    </div>
  );
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className="tap flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-border disabled:text-faint">
      {children}
    </button>
  );
}

function LogWeightPanel({ suggestedKg }: { suggestedKg: number | null }) {
  const app = useApp();
  const [text, setText] = useState(() => (suggestedKg === null ? '' : (roundForDisplay(suggestedKg, 1) as number).toFixed(1)));
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [whenChanged, setWhenChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The chip shows the time the save will use, so it keeps up until someone picks a time.
  useEffect(() => {
    if (whenChanged) return;
    const timer = window.setInterval(() => setWhen(toLocalInput(new Date())), 30_000);
    return () => window.clearInterval(timer);
  }, [whenChanged]);

  const kg = parseKg(text);
  const parsedAt = when ? new Date(when) : null;
  const at = parsedAt && !Number.isNaN(parsedAt.getTime()) ? parsedAt : null;
  const inFuture = at !== null && at.getTime() > Date.now();
  const invalid = text.trim() !== '' && kg === null;
  const canSave = kg !== null && at !== null && !inFuture && !saving && !saved;

  function changeText(next: string) {
    setText(next);
    setSaved(false);
  }

  function step(delta: number) {
    if (kg === null) return;
    const next = steppedKgText(kg, delta);
    if (next !== null) changeText(next);
  }

  async function save() {
    if (kg === null || at === null) return;
    setSaving(true);
    setError(null);
    try {
      const now = new Date();
      await app.db.saveWeight(buildWeightEntry({ weight_kg: kg, at: whenChanged ? at : now, tz: browserTimeZone(), now }));
      await app.changed();
      setSaved(true);
      setWhen(toLocalInput(new Date()));
      setWhenChanged(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  let saveStyle = 'border border-border bg-raised text-faint';
  if (saved) saveStyle = 'bg-border text-secondary';
  else if (canSave) saveStyle = 'bg-accent text-ground';

  return (
    <div className={`${CARD} p-[22px]`}>
      <div className="flex items-center justify-between">
        <h2 className="text-[17px] font-bold">Log weight</h2>
        <span className="relative flex h-7 items-center rounded-full border border-border bg-raised px-3 text-[12px] text-soft focus-within:border-accent-2">
          {whenLabel(at)}
          <input
            type="datetime-local"
            aria-label="Date and time"
            value={when}
            max={toLocalInput(new Date())}
            onChange={(e) => {
              setWhen(e.target.value);
              setWhenChanged(true);
              setSaved(false);
            }}
            onClick={(e) => {
              try {
                e.currentTarget.showPicker();
              } catch {
                // Not every browser has showPicker; the field still works by typing.
              }
            }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </span>
      </div>

      <div className="mt-[18px] flex items-center justify-between rounded-2xl bg-raised p-3">
        <StepButton label="Minus 0.1 kg" disabled={kg === null} onClick={() => step(-0.1)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
            <path d="M5 12h14" />
          </svg>
        </StepButton>
        <div className="min-w-0 text-center">
          <input
            aria-label="Weight in kg"
            inputMode="decimal"
            placeholder="--.-"
            value={text}
            onChange={(e) => changeText(e.target.value)}
            className="block w-[150px] border-b-2 border-transparent bg-transparent text-center text-[48px] font-bold leading-[1.05] tracking-[-1.5px] outline-none placeholder:text-strong focus:border-accent"
          />
          <div className="text-[13px] text-secondary">kg</div>
        </div>
        <StepButton label="Plus 0.1 kg" disabled={kg === null} onClick={() => step(0.1)}>
          <Icon name="plus" size={20} stroke={2.4} />
        </StepButton>
      </div>

      {invalid && (
        <div role="status" className="mt-2.5 text-center text-[13px] text-accent-2">
          Enter a weight between {WEIGHT_RANGE_KG.min} and {WEIGHT_RANGE_KG.max} kg
        </div>
      )}
      {inFuture && (
        <div className="mt-3">
          <Notice>A weight can't be in the future.</Notice>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}

      <button type="button" onClick={save} disabled={!canSave} className={`tap mt-4 flex h-[52px] w-full items-center justify-center rounded-full text-base font-bold ${saveStyle}`}>
        {saved ? 'Saved' : 'Save weight'}
      </button>
    </div>
  );
}

function GoalPanel({ targetKg, paceKg, weeks, progress }: { targetKg: number | null; paceKg: number | null; weeks: number | null; progress: number | null }) {
  let eta = '?';
  if (weeks === 0) eta = 'Reached';
  else if (weeks !== null) eta = `${weeks} ${weeks === 1 ? 'week' : 'weeks'}`;
  const pace = roundForDisplay(paceKg, 2);
  const unit = 'text-[12px] font-medium text-secondary';
  return (
    <div className={`${CARD} p-[22px]`}>
      <h2 className="text-[17px] font-bold">Goal</h2>
      <div className="mt-3.5 grid grid-cols-2 gap-2.5">
        <div className="rounded-[14px] bg-raised px-3.5 py-3">
          <div className="text-[12px] text-secondary">Target weight</div>
          <div className="mt-0.5 text-[20px] font-bold">
            {kgText(targetKg)} <span className={unit}>kg</span>
          </div>
        </div>
        <div className="rounded-[14px] bg-raised px-3.5 py-3">
          <div className="text-[12px] text-secondary">Pace</div>
          <div className="mt-0.5 text-[20px] font-bold">
            {pace === null ? '?' : pace} <span className={unit}>kg / week</span>
          </div>
        </div>
      </div>
      <div className="mt-3.5 flex justify-between text-[13px] text-secondary">
        <span>Estimated time to goal</span>
        <span className="font-semibold text-text">{eta}</span>
      </div>
      <div
        className="mt-2.5 h-1.5 rounded-[3px] bg-border"
        role="progressbar"
        aria-label="Progress to goal"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress === null ? undefined : Math.round(progress * 100)}
      >
        {progress !== null && <div className="h-1.5 rounded-[3px] bg-accent" style={{ width: `${progress * 100}%` }} />}
      </div>
    </div>
  );
}

export function DesktopWeight() {
  const app = useApp();
  const [, mode, id] = useRoute();
  const close = useBack('/weight');
  const [range, setRange] = useState<WeightRange>('30D');
  const day = today();
  const { data, error } = useData(async () => {
    const weights = await app.db.weightHistory();
    const goal = await app.db.latestGoal();
    return { weights, goal };
  }, []);

  const weights = data?.weights ?? [];
  const goal = data?.goal ?? null;
  const latest = weights.length > 0 ? weights[weights.length - 1] : null;
  const latestKg = latest?.weight_kg ?? null;
  const from = rangeStart(range, day, null);
  const summary = weightSummary(weights, from, day);
  const change = weightLine(summary.days).change_kg;
  const changes = weighInChanges(weights);
  const rows = weights.map((w, i) => ({ w, change: changes[i] })).filter((r) => r.w.local_date >= from).reverse();
  const targetKg = goal?.target_weight_kg ?? null;
  const distance = goal ? toGoal(latestKg, targetKg, goal.goal_type) : null;
  const estimate = goal ? goalEstimate({ weight_kg: latestKg, start_kg: goal.weight_kg, target_kg: targetKg, pace_kg_per_week: goal.pace_kg_per_week, goal_type: goal.goal_type }) : { weeks: null, progress: null };
  const editing = mode === 'edit' && data ? (weights.find((w) => w.id === id) ?? null) : null;

  let toGoalText = '?';
  if (distance?.reached) toGoalText = 'Reached';
  else if (distance && distance.kg !== null) toGoalText = withUnit(distance.kg);

  return (
    <DesktopShell active="weight" title="Weight">
      {error && (
        <div className="mb-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-w-0 flex-col gap-5">
          <div className={`${CARD} p-6`}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[13px] text-secondary">Weight, {RANGES.find((r) => r.id === range)?.sub}</div>
                <div className="mt-1 flex items-baseline gap-3.5">
                  <span className="text-[48px] font-bold leading-[1.2] tracking-[-1.4px]">{withUnit(latestKg)}</span>
                  <span className="text-[15px] font-semibold text-accent-2">{change === null ? '?' : `${signedKg(change)} kg`}</span>
                </div>
              </div>
              <div className="flex gap-2">
                {RANGES.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={range === r.id}
                    onClick={() => setRange(r.id)}
                    className={`tap flex h-8 items-center rounded-full px-3.5 text-[13px] ${range === r.id ? 'bg-text font-bold text-ground' : 'border border-border bg-raised text-soft'}`}
                  >
                    {r.id}
                  </button>
                ))}
              </div>
            </div>

            <WeightChart days={summary.days} />

            <div className="mt-5 grid grid-cols-5 gap-2.5">
              <Stat label="Lowest">{withUnit(summary.stats.lowest_kg)}</Stat>
              <Stat label="Highest">{withUnit(summary.stats.highest_kg)}</Stat>
              <Stat label="Average">{withUnit(summary.stats.average_kg)}</Stat>
              <Stat label="Weigh-ins">{rows.length}</Stat>
              <Stat label={targetKg === null ? 'To goal' : `To goal ${kgText(targetKg)}`} accent>
                {toGoalText}
              </Stat>
            </div>
          </div>

          <div className={`${CARD} overflow-hidden`}>
            <h2 className="px-6 pb-3 pt-5 text-[17px] font-bold">Weigh-ins</h2>
            <div className={`${CHANGE_GRID} px-6 pb-2.5 text-[11px] text-secondary`}>
              <span>Date</span>
              <span className="text-right">Weight</span>
              <span className="text-right">Change</span>
              <span>Source</span>
            </div>
            {rows.length === 0 && <p className="border-t border-border px-6 py-3 text-sm text-secondary">No weigh-ins in this period.</p>}
            <ul aria-label="Weigh-ins">
              {rows.map(({ w, change: delta }) => {
                const shown = delta === null ? '' : signedKg(delta);
                return (
                  <li key={w.id} className="border-t border-border">
                    <a
                      href={href('weight', 'edit', w.id)}
                      aria-label={`Edit weight ${kgText(w.weight_kg)} kg, ${dayLabel(w.local_date)} ${timeIn(w.measured_at, w.tz)}`}
                      className={`${CHANGE_GRID} tap items-center px-6 py-3 text-[14px] hover:bg-raised`}
                    >
                      <span className="font-semibold">{dayLabel(w.local_date).replace(',', '')}</span>
                      <span className="text-right font-bold">{kgText(w.weight_kg)} kg</span>
                      <span className={`text-right ${delta !== null && (roundForDisplay(delta, 1) as number) > 0 ? 'text-accent-2' : 'text-secondary'}`}>{shown}</span>
                      <span className="text-secondary">{w.source === 'apple_health' ? 'Apple Health' : 'Manual'}</span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <aside className="flex flex-col gap-5 xl:sticky xl:top-0">
          {data && <LogWeightPanel suggestedKg={latestKg} />}
          <GoalPanel targetKg={targetKg} paceKg={goal?.pace_kg_per_week ?? null} weeks={estimate.weeks} progress={estimate.progress} />
        </aside>
      </div>

      {mode === 'log' && data && <WeightSheet entry={null} suggestedKg={latestKg} onClose={close} />}
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
    </DesktopShell>
  );
}
