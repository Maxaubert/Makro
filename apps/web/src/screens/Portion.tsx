// Add portion: amount and unit with live kcal and macros for that portion (portion.json maths,
// display.json rounding). Unknown values show "?", never 0. Logging is never blocked: a product
// without numbers can still be logged, or turned into a custom food with the label values.
import { useState } from 'react';
import type { Product } from '../data/products';
import { buildLogEntry, MEALS, parseAmount, unitsFor, type CustomFoodRow, type FoodRef, type Meal } from '../domain/entry';
import { formatNumber } from '../domain/format';
import { resolveGrams, type AmountUnit } from '../domain/grams';
import { browserTimeZone } from '../domain/localDate';
import { NUTRIENTS } from '../domain/nutrients';
import { portion } from '../domain/portion';
import { href, navigate, useApp, useAppState, useData } from '../lib/hooks';
import { Card, Chip, Header, Icon, Notice, Page, PrimaryButton, SecondaryButton, SourceBadge } from '../ui/kit';
import { MEAL_LABEL, mealForNow } from './day';

type Food = { ref: FoodRef; per: Product | CustomFoodRow; sourceName: string; verified: boolean | null; values: Record<string, number | null>; last: { quantity: number; unit: AmountUnit } | null };

export function Portion({ kind, id }: { kind: string; id: string }) {
  const app = useApp();
  const { products } = useAppState();
  const ready = products.status === 'ready';
  const dbVersion = ready ? products.meta.db_version : null;
  const { data, error } = useData(async (): Promise<Food | { missing: string }> => {
    if (kind === 'custom') {
      const f = await app.db.customFood(id);
      if (!f) return { missing: 'This custom food is not on this device yet. Try again after syncing.' };
      const last = await app.db.lastPortion('custom', id);
      return { ref: { kind: 'custom', food: f }, per: f, sourceName: 'Your own food', verified: null, values: Object.fromEntries(NUTRIENTS.map((n) => [n, f[n]])), last };
    }
    if (!ready) return { missing: 'The food database is still loading.' };
    const r = await app.db.product(id);
    if (r.status === 'removed') return { missing: 'This product is no longer in the food database.' };
    const last = await app.db.lastPortion('product', r.product.id);
    return { ref: { kind: 'product', product: r.product, db_version: dbVersion }, per: r.product, sourceName: r.product.source_name, verified: r.product.verified, values: r.product.nutrients, last };
  }, [kind, id, ready]);

  if (!data) {
    return (
      <Page>
        <Header title="Add portion" back="/add" />
        {error && <Notice tone="error">{error}</Notice>}
      </Page>
    );
  }
  if ('missing' in data) {
    return (
      <Page>
        <Header title="Add portion" back="/add" />
        <div className="mt-4"><Notice>{data.missing}</Notice></div>
      </Page>
    );
  }
  return <PortionForm food={data} />;
}

function PortionForm({ food }: { food: Food }) {
  const app = useApp();
  const units = unitsFor(food.per);
  // Start from the amount you logged last time for this food, if its unit is still offered.
  const last = food.last && units.includes(food.last.unit) ? food.last : null;
  const [unit, setUnit] = useState<AmountUnit>(last?.unit ?? units[0]);
  const [qty, setQty] = useState(last ? String(last.quantity) : units[0] === 'g' || units[0] === 'ml' ? '100' : '1');
  const [meal, setMeal] = useState<Meal>(mealForNow());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  let quantity: number | null = null;
  try {
    quantity = parseAmount(qty);
  } catch {
    quantity = null;
  }
  const grams = quantity === null ? null : resolveGrams({ quantity, unit, serving_g: food.per.serving_g }).grams;
  const values = grams === null ? null : portion(food.values, grams);
  const noData = NUTRIENTS.every((n) => food.values[n] === null);
  const p = food.per;

  function pickUnit(u: AmountUnit) {
    setUnit(u);
    setQty(u === 'g' || u === 'ml' ? '100' : '1');
  }

  async function add() {
    if (quantity === null || grams === null) return;
    setSaving(true);
    try {
      const entry = buildLogEntry({ food: food.ref, quantity, unit, meal, at: new Date(), tz: browserTimeZone() });
      await app.db.saveLogEntry(entry);
      await app.changed();
      navigate('/today');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  const unitLabel = (u: AmountUnit) =>
    u === 'serving' ? `Serving ${formatNumber(p.serving_g, 0)} g` : u === 'piece' ? `Piece ${formatNumber(p.serving_g, 0)} g` : u === 'ml' ? 'Millilitres' : 'Grams';

  const customHref = `${href('custom')}?name=${encodeURIComponent(p.name)}&brand=${encodeURIComponent(p.brand ?? '')}&ean=${encodeURIComponent(p.ean ?? '')}`;

  return (
    <Page>
      <Header title="Add portion" back="/add" />
      <div className="pt-3">
        <div className="text-[22px] font-bold" data-testid="portion-name">{p.name}</div>
        <div className="mt-0.5 text-[13px] text-secondary">{[p.brand, 'pack_size' in p ? p.pack_size : null].filter(Boolean).join(' · ')}</div>
        <div className="mt-1.5">
          <SourceBadge sourceName={food.sourceName} verified={food.verified} />
        </div>
      </div>

      {noData && (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-border p-4">
          <Icon name="alert" className="mt-0.5 shrink-0 text-accent-2" />
          <div className="text-sm">
            <div className="font-semibold">No nutrition data</div>
            <div className="mt-0.5 text-secondary">You can log it without numbers, or enter the numbers from the label.</div>
            <a href={customHref} className="mt-2 inline-block font-semibold text-accent-2">Enter numbers from the label</a>
          </div>
        </div>
      )}

      <Card className="mt-4 px-4 py-5 text-center">
        <label htmlFor="qty" className="text-[13px] text-secondary">Amount</label>
        <div className="flex items-baseline justify-center gap-1">
          <input
            id="qty"
            className="num w-40 rounded-xl bg-transparent text-right text-6xl font-bold tracking-[-0.03em] outline-none focus:bg-ground"
            inputMode="decimal"
            autoFocus
            value={qty}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setQty(e.target.value)}
          />
          <span className="text-[22px] font-medium text-secondary">{unit === 'serving' ? (quantity === 1 ? 'serving' : 'servings') : unit === 'piece' ? (quantity === 1 ? 'piece' : 'pieces') : unit}</span>
        </div>
        {(unit === 'serving' || unit === 'piece') && grams !== null && <div className="num text-[13px] text-secondary">{formatNumber(grams, 0)} g</div>}
        {unit === 'ml' && <div className="text-[13px] text-secondary">About {formatNumber(grams, 0)} g (1 ml counted as 1 g)</div>}
        <div className="mt-3.5 flex flex-wrap justify-center gap-2">
          {units.map((u) => (
            <Chip key={u} selected={u === unit} onClick={() => pickUnit(u)}>{unitLabel(u)}</Chip>
          ))}
        </div>
      </Card>

      {values && <NutrientGrid values={values} className="mt-3" />}

      <fieldset className="mt-3">
        <legend className="mb-2 text-[13px] text-secondary">Meal</legend>
        <div className="flex flex-wrap gap-2">
          {MEALS.map((m) => (
            <Chip key={m} selected={meal === m} onClick={() => setMeal(m)}>{MEAL_LABEL[m]}</Chip>
          ))}
        </div>
      </fieldset>

      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}

      <div className="mt-auto flex flex-col gap-2 pt-6">
        <PrimaryButton onClick={add} disabled={grams === null || saving}>
          {noData ? `Log without numbers to ${MEAL_LABEL[meal]}` : `Add to ${MEAL_LABEL[meal]}`}
        </PrimaryButton>
        {!noData && food.ref.kind === 'product' && <SecondaryButton href={customHref}>Numbers wrong? Make a custom food</SecondaryButton>}
      </div>
    </Page>
  );
}

/** kcal and macros for a portion. "?" for unknown, never 0. */
export function NutrientGrid({ values, className = '' }: { values: Record<string, number | null>; className?: string }) {
  const cell = (label: string, key: string) => (
    <div>
      <div className="text-[11px] text-secondary">{label}</div>
      <div className={`num text-[15px] font-semibold ${values[key] === null ? 'text-secondary' : ''}`} data-testid={`portion-${key}`}>
        {values[key] === null ? '?' : `${formatNumber(values[key], 1)} g`}
      </div>
    </div>
  );
  return (
    <Card className={`p-4 ${className}`}>
      <div className="flex items-baseline justify-between">
        <span className="text-[13px] text-secondary">This portion</span>
        <span className="num text-2xl font-bold text-accent-2" data-testid="portion-kcal">
          {formatNumber(values.kcal, 0)} <span className="text-[13px] font-medium text-secondary">kcal</span>
        </span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center">
        {cell('Protein', 'protein_g')}
        {cell('Carbs', 'carbs_g')}
        {cell('Fat', 'fat_g')}
        {cell('Fibre', 'fibre_g')}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-center">
        {cell('Sat. fat', 'sat_fat_g')}
        {cell('Sugars', 'sugars_g')}
        {cell('Salt', 'salt_g')}
        <div />
      </div>
      {Object.values(values).some((v) => v === null) && <p className="mt-2 text-[11px] text-secondary">? means the source has no value. It is not counted as 0.</p>}
    </Card>
  );
}
