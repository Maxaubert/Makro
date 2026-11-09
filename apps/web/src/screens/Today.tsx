// Today: half-ring kcal gauge, macro rings, quick actions and the latest weight.
// A target shows only when a goals row exists (set during onboarding).
import { formatNumber, formatTotal } from '../domain/format';
import { href, useApp, useAppState, useData } from '../lib/hooks';
import { canTryScan } from '../lib/scanner';
import { Card, HalfGauge, Icon, Page, Ring, SyncPill, UnknownNote } from '../ui/kit';
import { dayLabel, today, totalsOf } from './day';

const MACROS = [
  { key: 'protein_g', label: 'Protein', color: 'var(--color-accent)', goal: 'protein_g_target' },
  { key: 'carbs_g', label: 'Carbs', color: 'var(--color-accent-2)', goal: 'carbs_g_target' },
  { key: 'fat_g', label: 'Fat', color: 'var(--color-accent-3)', goal: 'fat_g_target' },
  { key: 'fibre_g', label: 'Fibre', color: 'var(--color-muted)', goal: 'fibre_g_target' },
] as const;

export function Today() {
  const app = useApp();
  const { sync, pending } = useAppState();
  const date = today();
  const { data } = useData(
    async () => ({
      entries: await app.db.dayEntries(date),
      goal: await app.db.goalFor(date),
      weight: (await app.db.weights(1))[0] ?? null,
    }),
    [date],
  );
  const entries = data?.entries ?? [];
  const goal = data?.goal ?? null;
  const totals = totalsOf(entries);
  const kcal = formatTotal(totals.kcal, 0);
  const eaten = totals.kcal.value ?? 0;
  const left = goal ? goal.kcal_target - eaten : null;

  return (
    <Page nav>
      <header className="flex items-center justify-between pt-2">
        <div>
          <div className="text-[13px] text-secondary">{dayLabel(date)}</div>
          <h1 className="mt-0.5 text-[28px] font-bold tracking-[-0.02em]">Today</h1>
        </div>
        <SyncPill sync={sync} pending={pending} />
      </header>

      <Card className="mt-4 p-4">
        <div className="flex justify-between text-[13px] text-secondary">
          <span>Calories</span>
          <span>{goal ? `Goal ${formatNumber(goal.kcal_target, 0)} kcal` : 'No goal set'}</span>
        </div>
        <div className="relative mt-1.5">
          <HalfGauge
            fraction={goal && totals.kcal.value !== null ? eaten / goal.kcal_target : null}
            label={goal ? `${kcal.text} of ${formatNumber(goal.kcal_target, 0)} kilocalories eaten` : `${kcal.text} kilocalories eaten`}
          />
          <div className="absolute inset-x-0 bottom-0.5 text-center">
            <div className="num text-5xl font-bold leading-none tracking-[-0.03em]" data-testid="kcal-headline">
              {left !== null && kcal.unknown === 0 ? formatNumber(Math.abs(left), 0) : kcal.text}
            </div>
            <div className="mt-0.5 text-[13px] text-secondary">
              {left !== null && kcal.unknown === 0 ? (left >= 0 ? 'kcal left' : 'kcal over') : 'kcal eaten'}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between text-[13px] text-secondary">
          <span>
            Eaten{' '}
            <b className="num text-text" data-testid="kcal-eaten">
              {kcal.text}
            </b>{' '}
            <UnknownNote count={kcal.unknown} />
          </span>
          <span>
            Foods logged <b className="text-text" data-testid="foods-logged">{entries.length}</b>
          </span>
        </div>
      </Card>

      <Card className="mt-3 grid grid-cols-4 gap-2 px-4 py-3.5 text-center">
        {MACROS.map((m) => {
          const t = totals[m.key];
          const f = formatTotal(t, t.value !== null && Math.abs(t.value) < 10 ? 1 : 0);
          const target = goal ? goal[m.goal] : null;
          return (
            <div key={m.key} data-testid={`macro-${m.key}`}>
              <div className="mx-auto h-14 w-14">
                <Ring fraction={target && t.value !== null ? t.value / target : null} color={m.color} />
              </div>
              <div className="mt-1.5 text-[12px] text-secondary">{m.label}</div>
              <div className="num text-[13px] font-semibold">{f.text} g</div>
              {f.unknown > 0 && <div className="text-[11px] text-secondary">+? ({f.unknown})</div>}
              {target !== null && <div className="text-[11px] text-secondary">of {formatNumber(target, 0)}</div>}
            </div>
          );
        })}
      </Card>

      <div className="mt-3 flex gap-2">
        <a href={href('add')} className="tap flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-accent text-sm font-bold text-ground">
          <Icon name="search" size={20} stroke={2} />
          Search food
        </a>
        <a href={href(canTryScan() ? 'scan' : 'code')} className="tap flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-border bg-raised text-sm font-semibold">
          <Icon name="barcode" size={20} />
          {canTryScan() ? 'Scan a code' : 'Type a code'}
        </a>
      </div>

      <a href={href('weight')} className="card tap mt-3 flex items-baseline justify-between px-4 py-3.5">
        <span className="text-[13px] text-secondary">Weight</span>
        {data?.weight ? (
          <span className="num text-xl font-bold">
            {formatNumber(data.weight.weight_kg, 1)} <span className="text-[13px] font-medium text-secondary">kg</span>
          </span>
        ) : (
          <span className="text-sm font-semibold text-accent-2">Log your weight</span>
        )}
      </a>
    </Page>
  );
}
