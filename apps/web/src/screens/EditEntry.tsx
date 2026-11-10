// Edit entry: change the amount or meal, or delete (a tombstone). The snapshot never changes.
import { useEffect, useState } from 'react';
import { MEALS, parseQuantity, type Meal } from '../domain/entry';
import { formatNumber } from '../domain/format';
import { NUTRIENTS } from '../domain/nutrients';
import { portion } from '../domain/portion';
import { navigate, useApp, useData } from '../lib/hooks';
import { Card, Chip, Header, Notice, Page, PrimaryButton, SourceBadge } from '../ui/kit';
import { MEAL_LABEL } from './day';
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
      setMeal(entry.meal);
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
          <SourceBadge sourceName={entry.source === 'custom' ? 'Your own food' : entry.source} verified={entry.verified === null ? null : entry.verified === 1} />
        </div>
      </div>

      <Card className="mt-4 p-5 text-center">
        <label htmlFor="qty" className="text-[13px] text-secondary">
          Amount ({entry.unit})
        </label>
        <input
          id="qty"
          className="num mx-auto mt-1 block w-48 rounded-xl bg-transparent text-center text-6xl font-bold tracking-[-0.03em] outline-none focus:bg-raised"
          inputMode="decimal"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        {entry.unit !== 'g' && entry.unit !== 'ml' && grams !== null && <div className="text-[13px] text-secondary">{formatNumber(grams, 0)} g</div>}
        {entry.unit === 'ml' && <div className="text-[13px] text-secondary">About {formatNumber(grams, 0)} g (1 ml counted as 1 g)</div>}
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
