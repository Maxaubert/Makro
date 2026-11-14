// D_Log: search with tabs, a table of results with macro columns, and the portion panel on the
// right that adds without leaving the page. Same data calls and domain code as AddFood and Portion.
// Missing values stay unknown as "?" (rule 2), verified rows carry the seal and the panel opens the
// source on tap (rule 4, decision 46), and "Add custom food" is always there (rule 5).
import { useDeferredValue, useState, type FormEvent, type ReactNode } from 'react';
import { BARCODE_LENGTHS, canonicalEan } from '../../data/barcode';
import { resolveBarcode, type BarcodeResult } from '../../data/barcodeResult';
import type { RecentFood, SavedMeal } from '../../data/logStore';
import { productSubtext, type Per100Unit, type Product } from '../../data/products';
import { roundForDisplay } from '../../domain/display';
import { buildFavourite, buildLogEntry, MEALS, mealTimeOn, parseQuantity, unitsFor, type CustomFoodRow, type FoodRef, type Meal } from '../../domain/entry';
import { buildDailySupplement, supplementEntry } from '../../domain/supplements';
import { formatNumber } from '../../domain/format';
import { resolveGrams, type AmountUnit } from '../../domain/grams';
import { browserTimeZone, pastLocalDate } from '../../domain/localDate';
import { normalise } from '../../domain/normalise';
import { NUTRIENTS } from '../../domain/nutrients';
import { packAmounts } from '../../domain/packSizes';
import { portion } from '../../domain/portion';
import { href, navigate, useApp, useAppState, useData, useQueryParam } from '../../lib/hooks';
import { DesktopSidebar, StreakPill } from '../../ui/desktop';
import { RepeatIcon } from '../../ui/icons-add-food';
import { Icon, Notice, SourceBadge, type IconName } from '../../ui/kit';
import { dayLabel, MEAL_LABEL, mealForNow, today, withDay } from '../day';

type Tab = 'recent' | 'favourites' | 'mine' | 'all';
const TABS: { id: Tab; label: string }[] = [
  { id: 'recent', label: 'Recent' },
  { id: 'favourites', label: 'Favourites' },
  { id: 'mine', label: 'My foods' },
  { id: 'all', label: 'All' },
];

const OWN_FOOD = 'Added by you';

interface Row {
  key: string;
  kind: 'product' | 'custom';
  id: string;
  name: string;
  sub: string | null;
  sourceName: string;
  verified: boolean | null;
  kcal: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  unit: Per100Unit;
}

function productRow(p: Product): Row {
  const { kcal, protein_g, carbs_g, fat_g } = p.nutrients;
  return { key: `product:${p.id}`, kind: 'product', id: p.id, name: p.name, sub: productSubtext(p), sourceName: p.source_name, verified: p.verified, kcal, protein_g, carbs_g, fat_g, unit: p.per_100_unit };
}

function customRow(f: CustomFoodRow): Row {
  return { key: `custom:${f.id}`, kind: 'custom', id: f.id, name: f.name, sub: f.brand, sourceName: OWN_FOOD, verified: null, kcal: f.kcal, protein_g: f.protein_g, carbs_g: f.carbs_g, fat_g: f.fat_g, unit: f.per_100_unit };
}

/** A logged food that can no longer be looked up: only what the log kept, so the macros stay unknown. */
function snapshotRow(r: RecentFood): Row {
  const kind = r.product_id ? 'product' : 'custom';
  const id = (r.product_id ?? r.custom_food_id) as string;
  return { key: `${kind}:${id}`, kind, id, name: r.name, sub: r.brand, sourceName: r.source === 'custom' ? OWN_FOOD : r.source, verified: r.verified === null ? null : r.verified === 1, kcal: r.kcal, protein_g: null, carbs_g: null, fat_g: null, unit: r.per_100_unit };
}

function barcodeRows(r: BarcodeResult | null): Row[] {
  if (r?.kind === 'product' || r?.kind === 'no-nutrition') return [productRow(r.product)];
  if (r?.kind === 'custom') return [customRow(r.food)];
  return [];
}

function Pill({ selected, onClick, small = false, children }: { selected: boolean; onClick: () => void; small?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`tap flex h-8 shrink-0 items-center rounded-full ${small ? 'px-2.5 text-[12px]' : 'px-3.5 text-[13px]'} ${
        selected ? 'bg-text font-bold text-ground' : 'border border-border bg-raised text-soft'
      }`}
    >
      {children}
    </button>
  );
}

// Below 1360 px the panel and the columns narrow.
const COLUMNS = 'grid grid-cols-[minmax(0,1fr)_52px_40px_40px_40px] gap-1.5 px-3 min-[1360px]:grid-cols-[minmax(0,1fr)_64px_64px_64px_64px] min-[1360px]:gap-2 min-[1360px]:px-5';

function FoodRow({ row, selected, onPick }: { row: Row; selected: boolean; onPick: () => void }) {
  const macro = (v: number | null) => <span className="num text-right text-secondary">{formatNumber(v, 1)}</span>;
  const sub = [row.sub, row.unit === 'ml' ? 'per 100 ml' : row.unit === 'portion' ? 'per portion' : null].filter(Boolean).join(' · ');
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onPick}
        data-testid="food-row"
        className={`${COLUMNS} min-h-11 w-full items-center border-t border-border py-[13px] text-left text-[14px] ${selected ? 'bg-raised-2 shadow-[inset_3px_0_0_var(--color-accent)]' : 'hover:bg-raised'}`}
      >
        <span className="min-w-0">
          <span className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold">{row.name}</span>
            <SourceBadge sourceName={row.sourceName} verified={row.verified} />
          </span>
          {sub && <span className="mt-0.5 block truncate text-[12px] text-secondary">{sub}</span>}
        </span>
        <span
          className={`num whitespace-nowrap text-right text-[13px] font-bold min-[1360px]:text-[16px] ${row.kcal === null ? 'text-secondary' : ''}`}
          title={row.kcal === null ? 'No nutrition data' : undefined}
        >
          {formatNumber(row.kcal, 0)}
          {row.kcal === null && <span className="sr-only"> No nutrition data</span>}
        </span>
        {macro(row.protein_g)}
        {macro(row.carbs_g)}
        {macro(row.fat_g)}
      </button>
    </li>
  );
}

export function DesktopLog() {
  const app = useApp();
  const { products } = useAppState();
  // Set when adding to an earlier day from the end-of-day screen. Barcode and saved meals log
  // for now only, so they are left out here rather than landing on the wrong day.
  const day = pastLocalDate(useQueryParam('date'), today());
  const [query, setQuery] = useState(useQueryParam('q') ?? '');
  const [tab, setTab] = useState<Tab>(query ? 'all' : 'recent');
  const [picked, setPicked] = useState<string | null>(null);
  const [typingCode, setTypingCode] = useState(false);
  const [code, setCode] = useState('');
  const [lookup, setLookup] = useState<BarcodeResult | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const q = useDeferredValue(query);
  const ready = products.status === 'ready';

  const { data: results, error } = useData(async () => (ready && q.trim() ? app.db.search(q, 30) : []), [q, ready]);
  const { data: mine } = useData(() => app.db.customFoods(), []);
  const { data: favourites } = useData(() => app.db.favouriteFoods(), [ready]);
  const { data: savedMeals } = useData(() => app.db.savedMeals(), []);
  // The log only keeps per-100 kcal for recents, so each is read back for its macros and source name.
  const { data: recents } = useData(async () => {
    const seen = new Map<string, Row>();
    const rows = await Promise.all(
      (await app.db.recentFoods(20)).map(async (r) => {
        if (r.custom_food_id) {
          const food = await app.db.customFood(r.custom_food_id);
          if (food) return customRow(food);
        } else if (r.product_id && ready) {
          const found = await app.db.product(r.product_id);
          if (found.status !== 'removed') return productRow(found.product);
        }
        return snapshotRow(r);
      }),
    );
    for (const row of rows) if (!seen.has(row.key)) seen.set(row.key, row);
    return [...seen.values()];
  }, [ready]);

  let rows: Row[];
  if (typingCode) {
    rows = barcodeRows(lookup);
  } else if (tab === 'recent' || (tab === 'all' && !q.trim())) {
    rows = recents ?? [];
  } else if (tab === 'all') {
    const nq = normalise(q.trim());
    const myMatches = (mine ?? []).filter((f) => nq && normalise(`${f.name} ${f.brand ?? ''}`).includes(nq));
    rows = [...myMatches.map(customRow), ...(results ?? []).map(productRow)];
  } else if (tab === 'favourites') {
    rows = (favourites ?? []).map((f: FoodRef) => (f.kind === 'product' ? productRow(f.product) : customRow(f.food)));
  } else {
    rows = (mine ?? []).map(customRow);
  }
  const selected = rows.find((r) => r.key === picked) ?? rows[0] ?? null;

  function pickTab(t: Tab) {
    setTab(t);
    setPicked(null);
    setTypingCode(false);
  }

  const codeValid = canonicalEan(code) !== null && BARCODE_LENGTHS.includes(code.length);

  async function find(e: FormEvent) {
    e.preventDefault();
    if (!typingCode || !codeValid) return;
    setCodeError(null);
    if (!ready) {
      setCodeError('Food database still loading.');
      return;
    }
    try {
      const [product, customFoods] = await Promise.all([app.db.barcode(code), app.db.customFoods()]);
      const result = resolveBarcode(code, product, customFoods);
      setLookup(result);
      setPicked(null);
      if (result.kind === 'invalid') setCodeError('That is not a barcode.');
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : String(err));
    }
  }

  const notFound = typingCode && lookup?.kind === 'not-found' ? lookup : null;
  const customHref = withDay(
    notFound ? `${href('custom')}?ean=${encodeURIComponent(notFound.ean)}` : `${href('custom')}?name=${encodeURIComponent(query.trim())}&q=${encodeURIComponent(query.trim())}`,
    day,
  );
  const anyMl = rows.some((r) => r.unit === 'ml');

  let empty: { icon: IconName; text: string } | null = null;
  if (rows.length === 0) {
    if (notFound) empty = { icon: 'noBarcode', text: `Not in the database: ${notFound.ean}` };
    else if (typingCode) empty = { icon: 'barcode', text: 'Type the code' };
    else if (tab === 'all' && q.trim() && results) empty = { icon: 'search', text: 'No match' };
    else if (tab === 'recent' && recents) empty = { icon: 'repeat', text: 'No recents' };
    else if (tab === 'favourites' && favourites) empty = { icon: 'heart', text: 'No favourites' };
    else if (tab === 'mine' && mine) empty = { icon: 'profile', text: 'No own foods' };
  }

  return (
    <div className="flex h-dvh overflow-hidden [line-height:normal]">
      <DesktopSidebar active="add" />
      <main className="desktop-scroll flex min-w-0 flex-1 flex-col overflow-auto">
        {/* The board's header has the streak but not the Add food button of the other screens. */}
        <header className="flex h-[88px] shrink-0 items-center gap-4 px-8">
          <div className="mr-auto min-w-0">
            {day && (
              <div className="text-[13px] font-semibold text-accent-2" data-testid="adding-to-day">
                Adding to {dayLabel(day)}
              </div>
            )}
            <h1 className="mt-0.5 text-[30px] font-bold leading-[1.1] tracking-[-0.8px]">Add food</h1>
          </div>
          <StreakPill />
        </header>

        <div className="px-8 pb-8 pt-1">
          <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-5 min-[1360px]:grid-cols-[minmax(0,1fr)_400px]">
            <section className="flex min-w-0 flex-col gap-4">
              <form onSubmit={(e) => void find(e)} className="flex h-14 items-center gap-3 rounded-[28px] border border-border bg-card pl-5 pr-2.5 focus-within:border-accent-2">
                <Icon name={typingCode ? 'barcode' : 'search'} size={22} className="shrink-0 text-secondary" />
                {typingCode ? (
                  <>
                    <input
                      key="code"
                      aria-label="Barcode"
                      className="num h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-secondary"
                      placeholder="Type a barcode"
                      inputMode="numeric"
                      autoComplete="off"
                      autoFocus
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value.replace(/\D/g, '').slice(0, 14));
                        setLookup(null);
                        setCodeError(null);
                      }}
                    />
                    <button type="submit" disabled={!codeValid} className="tap flex h-[38px] shrink-0 items-center rounded-full bg-accent px-4 text-[13px] font-bold text-ground disabled:bg-border disabled:text-faint">
                      Find product
                    </button>
                    <button type="button" onClick={() => setTypingCode(false)} className="tap flex h-[38px] shrink-0 items-center rounded-full bg-border px-4 text-[13px] font-semibold">
                      Search by name
                    </button>
                  </>
                ) : (
                  <>
                    <input
                      key="search"
                      aria-label="Search foods"
                      className="h-full min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-secondary"
                      placeholder="Search foods"
                      autoFocus
                      enterKeyHint="search"
                      value={query}
                      onChange={(e) => {
                        setQuery(e.target.value);
                        setPicked(null);
                        if (tab !== 'all') setTab('all');
                      }}
                    />
                    {!day && (
                      <button
                        type="button"
                        onClick={() => {
                          setTypingCode(true);
                          setPicked(null);
                        }}
                        className="tap flex h-[38px] shrink-0 items-center rounded-full bg-border px-4 text-[13px] font-semibold"
                      >
                        Type a barcode
                      </button>
                    )}
                  </>
                )}
              </form>

              <div className="flex gap-2">
                {TABS.map((t) => (
                  <Pill key={t.id} selected={!typingCode && tab === t.id} onClick={() => pickTab(t.id)}>{t.label}</Pill>
                ))}
              </div>

              {codeError && typingCode && <Notice tone="error">{codeError}</Notice>}
              {!typingCode && products.status === 'loading' && (tab === 'all' || tab === 'favourites') && <Notice>{products.message}...</Notice>}
              {!typingCode && products.status === 'error' && tab === 'all' && <Notice tone="error">Food database failed: {products.message}</Notice>}
              {error && <Notice tone="error">{error}</Notice>}

              {!typingCode && tab === 'mine' && !day && savedMeals && savedMeals.length > 0 && <SavedMeals meals={savedMeals} />}

              <div className="overflow-hidden rounded-card border border-border bg-card">
                <div className={`${COLUMNS} pb-2.5 pt-3.5 text-[11px] text-secondary`}>
                  <span>Per 100 {anyMl ? 'g/ml' : 'g'}</span>
                  <span className="text-right">kcal</span>
                  <span className="text-right">Protein</span>
                  <span className="text-right">Carbs</span>
                  <span className="text-right">Fat</span>
                </div>
                <ul aria-label="Results">
                  {rows.map((r) => (
                    <FoodRow key={r.key} row={r} selected={r.key === selected?.key} onPick={() => setPicked(r.key)} />
                  ))}
                  {empty && (
                    <li className="flex items-center justify-center gap-2 border-t border-border px-5 py-6 text-[15px] font-semibold text-secondary" data-testid="log-empty">
                      <Icon name={empty.icon} size={20} />
                      {empty.text}
                    </li>
                  )}
                </ul>
              </div>

              <a href={customHref} className="tap flex h-14 items-center justify-center gap-2 rounded-2xl border border-dashed border-strong text-[15px] font-bold">
                <Icon name="plus" size={20} stroke={2.2} />
                Add custom food
              </a>
            </section>

            <aside aria-label="Portion" className="desktop-scroll sticky top-6 max-h-[calc(100dvh-48px)] overflow-y-auto rounded-card border border-border bg-card p-6">
              {selected ? (
                <PortionPanel key={selected.key} kind={selected.kind} id={selected.id} day={day} scannedEan={typingCode && lookup?.kind === 'no-nutrition' ? lookup.ean : null} />
              ) : (
                <div className="flex flex-col items-center gap-2 py-10 text-secondary" data-testid="portion-empty">
                  <Icon name="search" size={32} stroke={1.6} />
                  <p className="text-[15px] font-semibold">Pick a food</p>
                </div>
              )}
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}

/** One click logs the whole meal into the meal of the moment. Deleting asks once more. */
function SavedMeals({ meals }: { meals: SavedMeal[] }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logged, setLogged] = useState<string | null>(null);
  const meal = mealForNow();

  async function run(work: () => Promise<unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await work();
      await app.changed();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function log(m: SavedMeal) {
    if (await run(() => app.db.logSavedMeal(m.id, meal, new Date(), browserTimeZone()))) setLogged(`Added ${m.name} to ${MEAL_LABEL[meal]}.`);
  }

  return (
    <section aria-label="Saved meals" className="overflow-hidden rounded-card border border-border bg-card">
      <h2 className="px-5 pb-2.5 pt-3.5 text-[11px] font-normal text-secondary">Saved meals</h2>
      {error && <div className="px-5 pb-3"><Notice tone="error">{error}</Notice></div>}
      {logged && <p role="status" className="px-5 pb-3 text-[13px] text-accent-2">{logged}</p>}
      <ul>
        {meals.map((m) => (
          <li key={m.id} className="flex items-center gap-2 border-t border-border py-2.5 pl-5 pr-3">
            <span className="min-w-0 grow">
              <span className="block truncate text-[15px] font-semibold">{m.name}</span>
              <span className="mt-0.5 block truncate text-[12px] text-secondary">{m.items.map((i) => i.name).join(', ')}</span>
            </span>
            <button type="button" disabled={busy} onClick={() => void log(m)} data-testid="saved-meal" className="tap flex h-9 shrink-0 items-center rounded-full bg-accent px-3.5 text-[13px] font-bold text-ground">
              Add to {MEAL_LABEL[meal]}
            </button>
            {confirming === m.id ? (
              <button type="button" disabled={busy} onClick={() => void run(() => app.db.deleteSavedMeal(m.id))} className="tap h-9 shrink-0 rounded-full px-3 text-[13px] font-bold text-accent-3">
                Delete
              </button>
            ) : (
              <button type="button" aria-label={`Delete ${m.name}`} onClick={() => setConfirming(m.id)} className="tap flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-secondary">
                <Icon name="erase" size={18} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

type Food = { ref: FoodRef; per: Product | CustomFoodRow; sourceName: string; verified: boolean | null; values: Record<string, number | null>; last: { quantity: number; unit: AmountUnit } | null; ids: string[]; favourite: boolean };

function PortionPanel({ kind, id, day, scannedEan }: { kind: 'product' | 'custom'; id: string; day: string | null; scannedEan: string | null }) {
  const app = useApp();
  const { products } = useAppState();
  const ready = products.status === 'ready';
  const dbVersion = ready ? products.meta.db_version : null;
  const { data, error } = useData(async (): Promise<Food | { missing: string }> => {
    if (kind === 'custom') {
      const f = await app.db.customFood(id);
      if (!f) return { missing: 'This custom food is not on this device yet. Try again after syncing.' };
      const last = await app.db.lastPortion('custom', [id]);
      const favourite = await app.db.isFavourite('custom', [id]);
      return { ref: { kind: 'custom', food: f }, per: f, sourceName: OWN_FOOD, verified: null, values: Object.fromEntries(NUTRIENTS.map((n) => [n, f[n]])), last, ids: [id], favourite };
    }
    if (!ready) return { missing: 'The food database is still loading.' };
    const r = await app.db.product(id);
    if (r.status === 'removed') return { missing: 'This product is no longer in the food database.' };
    // Old log entries may carry an id that now redirects here, so ask for all of them.
    const ids = await app.db.productAliases(r.product.id);
    const last = await app.db.lastPortion('product', ids);
    const favourite = await app.db.isFavourite('product', ids);
    return { ref: { kind: 'product', product: r.product, db_version: dbVersion }, per: r.product, sourceName: r.product.source_name, verified: r.product.verified, values: r.product.nutrients, last, ids, favourite };
  }, [kind, id, ready]);

  if (!data) return error ? <Notice tone="error">{error}</Notice> : null;
  if ('missing' in data) return <Notice>{data.missing}</Notice>;
  return <PortionForm food={data} day={day} scannedEan={scannedEan} />;
}

function Macro({ label, name, value }: { label: string; name: string; value: number | null }) {
  return (
    <div>
      <div className="text-[11px] text-secondary">{label}</div>
      <div
        className={`num text-[14px] font-semibold min-[1360px]:text-[16px] ${value === null ? 'text-secondary' : ''}`}
        data-testid={`portion-${name}`}
        title={value === null ? 'No value in the source, not counted as 0' : undefined}
      >
        {value === null ? '?' : `${formatNumber(value, 1)} g`}
      </div>
    </div>
  );
}

const BAR_COLOURS = ['bg-accent', 'bg-accent-2', 'bg-accent-3'];

/** Protein, carbs and fat as parts of one bar, by weight. Empty unless all three are known. */
function MacroBar({ values }: { values: Record<string, number | null> }) {
  const parts = [values.protein_g, values.carbs_g, values.fat_g];
  const known = parts.every((v) => v !== null) && parts.some((v) => (v as number) > 0);
  return (
    <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-[5px] bg-border" aria-hidden="true">
      {known && parts.map((v, i) => (v as number) > 0 && <div key={i} className={BAR_COLOURS[i]} style={{ flex: `${v} 0 0` }} />)}
    </div>
  );
}

const PRIMARY = 'tap mt-5 flex h-[54px] w-full items-center justify-center rounded-full bg-accent text-base font-bold text-ground disabled:bg-border disabled:text-faint';

function PortionForm({ food, day, scannedEan }: { food: Food; day: string | null; scannedEan: string | null }) {
  const app = useApp();
  const units = unitsFor(food.per);
  // Start from the amount you logged last time for this food, if its unit is still offered.
  const last = food.last && units.includes(food.last.unit) ? food.last : null;
  const [unit, setUnit] = useState<AmountUnit>(last?.unit ?? units[0]);
  const [qty, setQty] = useState(last ? String(last.quantity) : units[0] === 'g' || units[0] === 'ml' ? '100' : '1');
  const [meal, setMeal] = useState<Meal>(day ? 'dinner' : mealForNow());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState<string | null>(null);
  // Add every day (#52): the food goes to Daily supplements. Not when adding to an earlier day.
  const [daily, setDaily] = useState(false);
  const supplement = daily && !day;

  const quantity = parseQuantity(qty);
  const grams = quantity === null ? null : resolveGrams({ quantity, unit, serving_g: food.per.serving_g }).grams;
  const values = grams === null ? null : portion(food.values, grams);
  const noData = NUTRIENTS.every((n) => food.values[n] === null);
  const p = food.per;
  const byWeight = unit === 'g' || unit === 'ml';
  const step = byWeight ? 10 : 1;

  function changeQty(next: string) {
    setQty(next);
    setAdded(null);
  }

  function pickUnit(u: AmountUnit) {
    setUnit(u);
    changeQty(u === 'g' || u === 'ml' ? '100' : '1');
  }

  function stepBy(delta: number) {
    changeQty(String(roundForDisplay((quantity ?? 0) + delta, 2)));
  }

  async function add() {
    if (quantity === null || grams === null) return;
    setSaving(true);
    setError(null);
    try {
      const tz = browserTimeZone();
      const saved_at = new Date();
      if (supplement) {
        const s = buildDailySupplement({ food: food.ref, quantity, unit, at: saved_at, tz });
        await app.db.addDailySupplement(s, supplementEntry({ supplement: s, food: food.ref, snapshot: null, at: saved_at, tz }));
        await app.changed();
        setAdded('Added to daily supplements.');
        return;
      }
      await app.db.saveLogEntry(buildLogEntry({ food: food.ref, quantity, unit, meal, at: day ? mealTimeOn(day, meal, tz) : saved_at, tz, saved_at }));
      await app.changed();
      if (day) navigate(`/day-end/${day}`);
      else setAdded(`Added to ${MEAL_LABEL[meal]}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function toggleFavourite() {
    const ref = food.ref;
    try {
      if (food.favourite) await app.db.removeFavourites(ref.kind, food.ids);
      else await app.db.addFavourite(buildFavourite(ref.kind === 'product' ? { product_id: ref.product.id, custom_food_id: null } : { product_id: null, custom_food_id: ref.food.id }, new Date()));
      await app.changed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const unitLabel = (u: AmountUnit) => (u === 'portion' ? 'Portion' : u === 'serving' ? `Serving ${formatNumber(p.serving_g, 0)} g` : u === 'piece' ? `Piece ${formatNumber(p.serving_g, 0)} g` : `100 ${u}`);
  // Whole packs in the food's own unit, from the sizes the product file lists.
  const packs = 'pack_size' in p ? packAmounts(p.pack_size, p.per_100_unit) : [];
  const pickPack = (amount: number) => {
    setUnit(p.per_100_unit);
    changeQty(String(amount));
  };
  const unitSelected = (u: AmountUnit) => u === unit && quantity === (u === 'g' || u === 'ml' ? 100 : 1);
  const unitWord = byWeight ? unit : quantity === 1 ? unit : `${unit}s`;
  const sub = 'pack_size' in p ? productSubtext(p) : p.brand;
  const labelHref = withDay(`${href('custom')}?name=${encodeURIComponent(p.name)}&brand=${encodeURIComponent(p.brand ?? '')}&ean=${encodeURIComponent(scannedEan ?? p.ean ?? '')}`, day);

  const status = (
    <>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      {added && (
        <p role="status" className="mt-3 flex items-center justify-center gap-1.5 text-[14px] font-semibold text-accent-2" data-testid="portion-added">
          <Icon name="check" size={16} stroke={2.4} />
          {added}
          <a href={href('diary')} className="tap -my-2 ml-1 flex h-11 items-center gap-1 rounded-full px-2 text-text underline">
            <Icon name="diary" size={16} />
            Diary
          </a>
        </p>
      )}
    </>
  );

  return (
    <>
      <div className="flex items-start gap-3">
        <div className="min-w-0 grow">
          <div className="flex items-center gap-2">
            <div className="min-w-0 text-[26px] font-bold tracking-[-0.5px]" data-testid="portion-name">{p.name}</div>
            <SourceBadge sourceName={food.sourceName} verified={food.verified} detail />
          </div>
          {sub && <div className="mt-[3px] text-[13px] text-secondary">{sub}</div>}
        </div>
        <button
          type="button"
          aria-label="Favourite"
          aria-pressed={food.favourite}
          onClick={() => void toggleFavourite()}
          className={`tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-raised ${food.favourite ? 'text-accent' : 'text-text'}`}
        >
          <Icon name="heart" size={20} filled={food.favourite} />
        </button>
      </div>
      {noData ? (
        <div>
          <div className="mt-4 flex items-center gap-2.5 rounded-2xl bg-raised p-4 text-[15px] font-semibold text-accent-2" data-testid="no-nutrition">
            <Icon name="alert" size={20} />
            No nutrition data
          </div>
          <button type="button" className={PRIMARY} disabled={grams === null || saving} onClick={() => void add()}>Log without numbers</button>
          <a href={labelHref} className="tap mt-2.5 flex h-[50px] items-center justify-center rounded-full border border-border bg-raised text-[15px] font-semibold">Enter numbers from the label</a>
          {status}
        </div>
      ) : (
        <div>
          <div className="mt-5 flex items-center justify-between rounded-2xl bg-raised p-3">
            <button type="button" aria-label="Less" disabled={quantity === null || quantity <= step} onClick={() => stepBy(-step)} className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-border disabled:text-faint">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>
            </button>
            <div className="min-w-0 text-center">
              <label htmlFor="desktop-qty" className="sr-only">Amount</label>
              <div className="flex items-baseline justify-center gap-1">
                <input
                  id="desktop-qty"
                  className="num rounded-lg bg-transparent text-center text-[44px] font-bold leading-[1.1] tracking-[-1.5px] outline-none focus:bg-raised"
                  style={{ width: `${Math.max(qty.length, 1) + 0.6}ch` }}
                  inputMode="decimal"
                  value={qty}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => changeQty(e.target.value)}
                />
                <span className="text-[18px] font-medium text-secondary">{unitWord}</span>
              </div>
            </div>
            <button type="button" aria-label="More" onClick={() => stepBy(step)} className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-border">
              <Icon name="plus" size={18} stroke={2.4} />
            </button>
          </div>
          {!byWeight && unit !== 'portion' && grams !== null && <div className="num mt-1.5 text-center text-[13px] text-secondary">{formatNumber(grams, 0)} g</div>}
          {unit === 'ml' && <div className="num mt-1.5 text-center text-[13px] text-secondary" title="1 ml counted as 1 g">≈ {formatNumber(grams, 0)} g</div>}
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {units.map((u) => (
              <Pill key={u} selected={unitSelected(u)} onClick={() => pickUnit(u)}>{unitLabel(u)}</Pill>
            ))}
            {packs.map((k) => (
              <Pill key={`pack-${k.amount}`} selected={unit === p.per_100_unit && quantity === k.amount} onClick={() => pickPack(k.amount)}>Pack {k.label}</Pill>
            ))}
          </div>

          {values && (
            <div className="mt-[18px] rounded-2xl bg-raised p-4">
              <div className="text-center">
                <span className={`num text-[36px] font-bold leading-none ${values.kcal === null ? 'text-secondary' : 'text-accent-2'}`} data-testid="portion-kcal">
                  {formatNumber(values.kcal, 0)} <span className="text-[14px] font-medium text-secondary">kcal</span>
                </span>
              </div>
              <MacroBar values={values} />
              <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                <Macro label="Protein" name="protein_g" value={values.protein_g} />
                <Macro label="Carbs" name="carbs_g" value={values.carbs_g} />
                <Macro label="Fat" name="fat_g" value={values.fat_g} />
                <Macro label="Fibre" name="fibre_g" value={values.fibre_g} />
              </div>
            </div>
          )}

          {!day && (
            <button
              type="button"
              role="switch"
              aria-checked={daily}
              onClick={() => { setDaily(!daily); setAdded(null); }}
              className="mt-[18px] flex w-full items-center justify-between gap-4 rounded-2xl border border-border px-4 py-2.5 text-left"
              data-testid="add-every-day"
            >
              <span className="flex items-center gap-2.5 text-[14px] font-semibold">
                <RepeatIcon size={18} className={daily ? 'text-accent' : 'text-secondary'} />
                Add every day
              </span>
              <span className={`relative h-[26px] w-11 flex-none rounded-full ${daily ? 'bg-accent' : 'bg-strong'}`}>
                <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-ground ${daily ? 'left-[21px]' : 'left-[3px]'}`} />
              </span>
            </button>
          )}

          {!supplement && (
            <div role="group" aria-label="Meal" className="mt-[18px] flex flex-wrap items-center gap-1.5">
              {MEALS.map((m) => (
                <Pill key={m} small selected={meal === m} onClick={() => { setMeal(m); setAdded(null); }}>{MEAL_LABEL[m]}</Pill>
              ))}
            </div>
          )}

          <button type="button" className={PRIMARY} disabled={grams === null || saving} onClick={() => void add()}>{supplement ? 'Add to daily supplements' : `Add to ${MEAL_LABEL[meal]}`}</button>
          {status}
        </div>
      )}
    </>
  );
}
