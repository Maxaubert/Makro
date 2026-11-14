// Add food: search the product database (FTS5, same query and ranking as the phone), with
// the verified seal on verified rows (rule 4, decision 46), recents, favourites, your own foods and saved
// meals. Never a dead end: "Add custom" is always there (rule 5).
import { useDeferredValue, useState } from 'react';
import type { SavedMeal } from '../data/logStore';
import { perLabel, productSubtext, type Per100Unit, type Product } from '../data/products';
import type { CustomFoodRow } from '../domain/entry';
import { normalise } from '../domain/normalise';
import { formatNumber } from '../domain/format';
import { browserTimeZone, pastLocalDate } from '../domain/localDate';
import { href, navigate, useApp, useAppState, useData, useQueryParam } from '../lib/hooks';
import { canTryScan } from '../lib/scanner';
import { CalendarIcon, InfoChip } from '../ui/icons-add-food';
import { Chip, Header, Icon, Notice, Page, SourceBadge, type IconName } from '../ui/kit';
import { dayLabel, MEAL_LABEL, mealForNow, today, withDay } from './day';

type Tab = 'all' | 'recent' | 'favourites' | 'mine';

interface Row {
  key: string;
  to: string;
  name: string;
  sub: string | null;
  sourceName: string;
  verified: boolean | null;
  kcal: number | null;
  unit: Per100Unit;
}

function productRow(p: Product): Row {
  return {
    key: p.id,
    to: href('portion', 'product', p.id),
    name: p.name,
    sub: productSubtext(p),
    sourceName: p.source_name,
    verified: p.verified,
    kcal: p.nutrients.kcal,
    unit: p.per_100_unit,
  };
}

function customRow(f: CustomFoodRow): Row {
  return { key: f.id, to: href('portion', 'custom', f.id), name: f.name, sub: f.brand, sourceName: 'Your own food', verified: null, kcal: f.kcal, unit: f.per_100_unit };
}

export function AddFood() {
  const app = useApp();
  const { products } = useAppState();
  // Set when adding to an earlier day from the end-of-day screen. Barcode and saved meals log
  // for now only, so they are left out here rather than landing on the wrong day.
  const day = pastLocalDate(useQueryParam('date'), today());
  const [query, setQuery] = useState(useQueryParam('q') ?? '');
  const [tab, setTab] = useState<Tab>('all');
  const q = useDeferredValue(query);
  const ready = products.status === 'ready';

  const { data: found, error } = useData(async () => ({ q, rows: ready && q.trim() ? await app.db.search(q, 30) : [] }), [q, ready]);
  // Results of an older query are still showing while the new one loads; they must not count as 'no match'.
  const results = found?.rows;
  const resultsCurrent = found?.q === q;
  const { data: recents } = useData(() => app.db.recentFoods(20), []);
  const { data: mine } = useData(() => app.db.customFoods(), []);
  const { data: favourites } = useData(() => app.db.favouriteFoods(), [ready]);
  const { data: savedMeals } = useData(() => app.db.savedMeals(), []);

  const recentRows = (): Row[] =>
    (recents ?? []).map((r) => ({
      key: r.product_id ?? `c:${r.custom_food_id}`,
      to: r.product_id ? href('portion', 'product', r.product_id) : href('portion', 'custom', r.custom_food_id as string),
      name: r.name,
      sub: r.brand,
      sourceName: r.source === 'custom' ? 'Your own food' : r.source,
      verified: r.verified === null ? null : r.verified === 1,
      kcal: r.kcal,
      unit: r.per_100_unit,
    }));

  let rows: Row[] = [];
  if (tab === 'all' && !q.trim()) {
    // Nothing typed yet: the foods you log most recently are the likeliest picks.
    rows = recentRows();
  } else if (tab === 'all') {
    const nq = normalise(q.trim());
    const myMatches = (mine ?? []).filter((f) => nq && normalise(`${f.name} ${f.brand ?? ''}`).includes(nq));
    rows = [...myMatches.map(customRow), ...(results ?? []).map(productRow)];
  } else if (tab === 'recent') {
    rows = recentRows();
  } else if (tab === 'favourites') {
    rows = (favourites ?? []).map((f) => (f.kind === 'product' ? productRow(f.product) : customRow(f.food)));
  } else {
    rows = (mine ?? []).map(customRow);
  }

  return (
    <Page>
      <Header title="Log food" back="/today" />
      {day && (
        <div className="mt-1">
          <InfoChip tone="accent" icon={<CalendarIcon size={14} />} label={`Adding to ${dayLabel(day)}`} testId="adding-to-day">{dayLabel(day)}</InfoChip>
        </div>
      )}

      <div className="mt-2 flex h-12 items-center gap-2.5 rounded-full border border-border bg-card pl-4 pr-1.5 focus-within:border-accent-2">
        <Icon name="search" size={20} className="text-secondary" />
        <input
          aria-label="Search foods"
          className="h-full flex-1 bg-transparent text-[16px] outline-none placeholder:text-faint"
          placeholder="Search foods"
          autoFocus
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (tab !== 'all') setTab('all');
          }}
        />
        {!day && (
          <a href={href(canTryScan() ? 'scan' : 'code')} aria-label={canTryScan() ? 'Scan a barcode' : 'Type a barcode'} className="tap flex h-[38px] w-[38px] items-center justify-center rounded-full bg-accent text-ground">
            <Icon name="barcode" size={20} stroke={2} />
          </a>
        )}
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto">
        <Chip selected={tab === 'all'} onClick={() => setTab('all')}>All</Chip>
        <Chip selected={tab === 'recent'} onClick={() => setTab('recent')}>Recent</Chip>
        <Chip selected={tab === 'favourites'} onClick={() => setTab('favourites')}>Favourites</Chip>
        <Chip selected={tab === 'mine'} onClick={() => setTab('mine')}>My foods</Chip>
      </div>

      {products.status === 'loading' && (tab === 'all' || tab === 'favourites') && <div className="mt-4"><Notice>{products.message}...</Notice></div>}
      {products.status === 'error' && tab === 'all' && (
        <div className="mt-4">
          <Notice tone="error">Food database failed: {products.message}</Notice>
        </div>
      )}
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      {tab === 'mine' && !day && savedMeals && savedMeals.length > 0 && <SavedMeals meals={savedMeals} />}

      <ul className="mt-3 flex flex-col gap-2" aria-label="Results">
        {rows.map((r) => (
          <li key={r.key}>
            <a href={withDay(r.to, day)} className="tap flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-card py-3 pl-4 pr-3" data-testid="food-row">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="min-w-0 text-[15px] font-semibold">{r.name}</span>
                  <SourceBadge sourceName={r.sourceName} verified={r.verified} />
                </div>
                {r.sub && <div className="mt-0.5 truncate text-[13px] text-secondary">{r.sub}</div>}
              </div>
              <div className="text-right" title={r.kcal === null ? 'No nutrition data' : undefined}>
                <div className={`num text-lg font-bold ${r.kcal === null ? 'text-secondary' : ''}`}>
                  {formatNumber(r.kcal, 0)}
                  {r.kcal === null && <span className="sr-only"> No nutrition data</span>}
                </div>
                <div className="text-[11px] text-secondary">kcal/{perLabel(r.unit)}</div>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-border" aria-hidden="true">
                <Icon name="plus" size={18} stroke={2.2} />
              </span>
            </a>
          </li>
        ))}
      </ul>

      {tab === 'all' && q.trim() && resultsCurrent && results && results.length === 0 && rows.length === 0 && <Empty icon="search" text="No match" />}
      {tab === 'recent' && recents && recents.length === 0 && <Empty icon="repeat" text="No recents" />}
      {tab === 'favourites' && favourites && favourites.length === 0 && <Empty icon="heart" text="No favourites" />}
      {tab === 'mine' && mine && mine.length === 0 && !(savedMeals && savedMeals.length > 0) && <Empty icon="profile" text="No own foods" />}

      <a
        href={withDay(`${href('custom')}?name=${encodeURIComponent(query.trim())}&q=${encodeURIComponent(query.trim())}`, day)}
        className="tap mt-3 flex h-14 items-center justify-center gap-2 rounded-2xl border border-dashed border-strong text-[15px] font-bold"
      >
        <Icon name="plus" size={20} stroke={2.2} />
        Add custom
      </a>
    </Page>
  );
}

function Empty({ icon, text }: { icon: IconName; text: string }) {
  return (
    <div className="mt-8 flex flex-col items-center gap-2 text-secondary">
      <Icon name={icon} size={32} stroke={1.6} />
      <p className="text-[15px] font-semibold">{text}</p>
    </div>
  );
}

/** One tap logs the whole meal into the meal of the moment. Deleting asks once more. */
function SavedMeals({ meals }: { meals: SavedMeal[] }) {
  const app = useApp();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const meal = mealForNow();

  async function run(work: () => Promise<unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
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

  async function log(id: string) {
    if (await run(() => app.db.logSavedMeal(id, meal, new Date(), browserTimeZone()))) navigate('/today');
  }

  return (
    <section aria-label="Saved meals" className="mt-4">
      <h2 className="text-[15px] font-bold text-secondary">Saved meals</h2>
      {error && <div className="mt-2"><Notice tone="error">{error}</Notice></div>}
      <ul className="mt-2 flex flex-col gap-2">
        {meals.map((m) => (
          <li key={m.id} className="flex min-h-11 items-center gap-1 rounded-2xl border border-border bg-card pr-1.5">
            <button type="button" disabled={busy} onClick={() => void log(m.id)} className="tap flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left" data-testid="saved-meal" aria-label={`Log ${m.name} to ${MEAL_LABEL[meal]}`}>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold">{m.name}</span>
                <span className="mt-0.5 block truncate text-[13px] text-secondary">{m.items.map((i) => i.name).join(', ')}</span>
              </span>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-ground" aria-hidden="true">
                <Icon name="plus" size={18} stroke={2.2} />
              </span>
            </button>
            {confirming === m.id ? (
              <button type="button" disabled={busy} onClick={() => void run(() => app.db.deleteSavedMeal(m.id))} className="tap h-11 shrink-0 rounded-full px-3 text-[13px] font-bold text-[#FFB38F]">
                Delete
              </button>
            ) : (
              <button type="button" aria-label={`Delete ${m.name}`} onClick={() => setConfirming(m.id)} className="tap flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-secondary">
                <Icon name="erase" size={18} />
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
