// Edit entry: change the amount or meal, or delete (a tombstone). The snapshot never changes.
import { useEffect, useState } from 'react';
import type { LocalLogEntry } from '../data/logStore';
import { isMeal, MEALS, parseQuantity, type Meal } from '../domain/entry';
import { browserTimeZone } from '../domain/localDate';
import { formatNumber } from '../domain/format';
import { NUTRIENTS } from '../domain/nutrients';
import { portion } from '../domain/portion';
import { navigate, useApp, useData } from '../lib/hooks';
import { CalendarIcon, InfoChip, RepeatIcon } from '../ui/icons-add-food';
import { Card, Chip, Header, Icon, Notice, Page, PrimaryButton, SourceBadge } from '../ui/kit';
import { MEAL_LABEL, today } from './day';
import { NutrientGrid } from './Portion';

export function EditEntry({ id }: { id: string }) {
  const app = useApp();
  const { data: entry } = useData(() => app.db.logEntry(id), [id]);
  const [qty, setQty] = useState('');
  const [meal, setMeal] = useState<Meal>('lunch');
  const [error, setError] = useState<string | null>(null);

  // Fill the fields once per entry. A sync re-reads the entry, and that must not overwrite what is typed.
  const loadedId = entry?.id;
  useEffect(() => {
    if (entry) {
      setQty(String(entry.quantity));
      if (isMeal(entry.meal)) setMeal(entry.meal);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedId]);

  if (entry === undefined) return <Page><Header title="Edit entry" back="/diary" /></Page>;
  if (entry === null || entry.deleted_at) {
    return (
      <Page>
        <Header title="Edit entry" back="/diary" />
        <Notice>This entry no longer exists.</Notice>
      </Page>
    );
  }

  if (entry.daily_supplement_id !== null) return <EditSupplement entry={entry} />;

  const quantity = parseQuantity(qty);
  const perUnit = entry.unit === 'g' || entry.unit === 'ml' ? 1 : entry.quantity > 0 ? entry.grams / entry.quantity : null;
  const grams = quantity !== null && perUnit !== null ? quantity * perUnit : null;
  const per100 = Object.fromEntries(NUTRIENTS.map((n) => [n, entry[n]]));
  const values = grams !== null ? portion(per100, grams) : null;

  async function save() {
    if (quantity === null || !entry) return;
    try {
      await app.db.updateLogEntry(entry.id, { quantity, meal });
      await app.changed();
      navigate(`/diary/${entry.local_date}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function remove() {
    if (!entry) return;
    await app.db.tombstone('log_entries', entry.id);
    await app.changed();
    navigate(`/diary/${entry.local_date}`);
  }

  return (
    <Page>
      <Header title="Edit entry" back="/diary" />
      <div className="pt-3">
        <div className="text-[22px] font-bold">{entry.name}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px] text-secondary">
          {entry.brand && <span>{entry.brand}</span>}
          <SourceBadge sourceName={entry.source === 'custom' ? 'Your own food' : entry.source} verified={entry.verified === null ? null : entry.verified === 1} detail />
        </div>
      </div>

      <Card className="mt-4 p-5 text-center">
        <AmountField unit={entry.unit} qty={qty} setQty={setQty} />
        {entry.unit !== 'g' && entry.unit !== 'ml' && grams !== null && <div className="num text-[13px] text-secondary">{formatNumber(grams, 0)} g</div>}
        {entry.unit === 'ml' && <div className="num text-[13px] text-secondary" title="1 ml counted as 1 g">≈ {formatNumber(grams, 0)} g</div>}
      </Card>

      <div className="mt-3 flex flex-wrap gap-2">
        {MEALS.map((m) => (
          <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>
            {MEAL_LABEL[m]}
          </Chip>
        ))}
      </div>

      {values && <NutrientGrid values={values} className="mt-3" />}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}

      <div className="mt-auto flex flex-col gap-2 pt-6">
        <PrimaryButton onClick={save} disabled={quantity === null}>
          Save changes
        </PrimaryButton>
        <button type="button" onClick={remove} className="tap h-12 rounded-full text-[15px] font-semibold text-[#FF6B3D] hover:bg-[#FF6B3D]/10">
          Delete entry
        </button>
      </div>
    </Page>
  );
}

/**
 * A daily supplement's entry (#52, canvas B2b). Today: a new amount counts from today on, Skip today,
 * Stop adding daily (the bin). An earlier day: only that day's amount, or delete that day's entry.
 */
function EditSupplement({ entry }: { entry: LocalLogEntry }) {
  const app = useApp();
  const now = today();
  const isToday = entry.local_date === now;
  const id = entry.daily_supplement_id as string;
  const { data: supplement } = useData(() => app.db.dailySupplement(id), [id]);
  const [qty, setQty] = useState(String(entry.quantity));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const quantity = parseQuantity(qty);
  const perUnit = entry.unit === 'g' || entry.unit === 'ml' ? 1 : entry.quantity > 0 ? entry.grams / entry.quantity : null;
  const grams = quantity !== null && perUnit !== null ? quantity * perUnit : null;
  const values = grams !== null ? portion(Object.fromEntries(NUTRIENTS.map((n) => [n, entry[n]])), grams) : null;
  const stopped = !!supplement && supplement.stopped_on !== null && supplement.stopped_on <= addDay(now);

  async function run(work: () => Promise<unknown>, back = true) {
    setBusy(true);
    setError(null);
    try {
      await work();
      await app.changed();
      if (back) navigate(`/diary/${entry.local_date}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const done = () =>
    run(() => (quantity === null ? Promise.resolve() : isToday && supplement && !supplement.deleted_at ? app.db.updateSupplementAmount(id, quantity, now) : app.db.updateLogEntry(entry.id, { quantity })));

  return (
    <Page>
      <Header title="Daily supplement" back="/diary" />
      <div className="pt-3">
        <div className="text-[22px] font-bold">{entry.name}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <InfoChip tone="accent" icon={<RepeatIcon size={14} />} label={stopped ? 'Daily, stopped from tomorrow' : 'Added every day'}>
            {stopped ? 'Ends today' : 'Daily'}
          </InfoChip>
          {supplement && !stopped && (
            <InfoChip icon={<CalendarIcon size={14} />} label={`Since ${supplement.start_date}`}>
              {supplement.start_date}
            </InfoChip>
          )}
        </div>
      </div>

      <Card className="mt-4 p-5 text-center">
        <AmountField unit={entry.unit} qty={qty} setQty={setQty} />
        <div className="mt-2 flex justify-center">
          <InfoChip
            icon={<CalendarIcon size={14} />}
            label={isToday ? 'A new amount counts from today on. Earlier days keep theirs.' : 'Changes this day only'}
          >
            {isToday ? 'From today' : 'This day only'}
          </InfoChip>
        </div>
      </Card>

      {values && <NutrientGrid values={values} className="mt-3" />}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}

      <div className="mt-auto flex flex-col gap-2 pt-6">
        {isToday && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => app.db.skipSupplementToday(id, new Date(), browserTimeZone()))}
            className="tap h-12 rounded-full border border-border bg-raised text-[15px] font-semibold"
          >
            Skip today
          </button>
        )}
        <div className="flex gap-2">
          {isToday && !stopped && (
            <button
              type="button"
              aria-label="Stop adding daily"
              disabled={busy}
              onClick={() => void run(() => app.db.stopSupplement(id, now))}
              className="tap flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-border bg-raised text-[#FF6B3D]"
            >
              <Icon name="trash" size={22} />
            </button>
          )}
          <PrimaryButton onClick={() => void done()} disabled={quantity === null || busy}>Done</PrimaryButton>
        </div>
        {isToday && !stopped && <p className="text-[12px] text-secondary">Bin: stops from tomorrow</p>}
        {!isToday && (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(() => app.db.tombstone('log_entries', entry.id))}
            className="tap h-12 rounded-full text-[15px] font-semibold text-[#FF6B3D] hover:bg-[#FF6B3D]/10"
          >
            Delete this day's entry
          </button>
        )}
      </div>
    </Page>
  );
}

/** The big amount with its unit beside it. The label is for screen readers only. */
function AmountField({ unit, qty, setQty }: { unit: string; qty: string; setQty: (v: string) => void }) {
  return (
    <>
      <label htmlFor="qty" className="sr-only">Amount in {unit}</label>
      <div className="flex items-baseline justify-center gap-1">
        <input
          id="qty"
          className="num w-40 rounded-xl bg-transparent text-right text-6xl font-bold tracking-[-0.03em] outline-none focus:bg-raised"
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <span className="text-[22px] font-medium text-secondary">{unit}</span>
      </div>
    </>
  );
}

function addDay(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
