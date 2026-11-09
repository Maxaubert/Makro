// Add food: search the product database (FTS5, same query and ranking as the phone), with
// source and verified on every row (rule 4), recents, favourites, your own foods and saved
// meals. Never a dead end: "Add custom" is always there (rule 5).
import { useDeferredValue, useState } from 'react';
import type { SavedMeal } from '../data/logStore';
import { productSubtext, type Product } from '../data/products';
import type { CustomFoodRow } from '../domain/entry';
import { normalise } from '../domain/normalise';
import { formatNumber } from '../domain/format';
import { browserTimeZone } from '../domain/localDate';
import { href, navigate, useApp, useAppState, useData, useQueryParam } from '../lib/hooks';
import { canTryScan } from '../lib/scanner';
import { Chip, Header, Icon, Notice, Page, SourceBadge } from '../ui/kit';
import { MEAL_LABEL, mealForNow } from './day';

type Tab = 'all' | 'recent' | 'favourites' | 'mine';

interface Row {
  key: string;
  to: string;
  name: string;
  sub: string | null;
  sourceName: string;
  verified: boolean | null;
  kcal: number | null;
  unit: 'g' | 'ml';
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
  const [query, setQuery] = useState(useQueryParam('q') ?? '');
  const [tab, setTab] = useState<Tab>('all');
  const q = useDeferredValue(query);
  const ready = products.status === 'ready';

  const { data: results, error } = useData(async () => (ready && q.trim() ? app.db.search(q, 30) : []), [q, ready]);
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

      <div className="mt-2 flex h-12 items-center gap-2.5 rounded-full border border-border bg-card pl-4 pr-1.5 focus-within:border-accent-2">
        <Icon name="search" size={20} className="text-secondary" />
        <input
          aria-label="Search foods"
          className="h-full flex-1 bg-transparent text-[16px] outline-none placeholder:text-[#6A6A70]"
          placeholder="Search foods"
          autoFocus
          enterKeyHint="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (tab !== 'all') setTab('all');
          }}
        />
        <a href={href(canTryScan() ? 'scan' : 'code')} aria-label={canTryScan() ? 'Scan a barcode' : 'Type a barcode'} className="tap flex h-[38px] w-[38px] items-center justify-center rounded-full bg-accent text-ground">
          <Icon name="barcode" size={20} stroke={2} />
        </a>
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
          <Notice tone="error">The food database could not be loaded: {products.message}. You can still add a custom food.</Notice>
        </div>
      )}
      {error && <div className="mt-4"><Notice tone="error">{error}</Notice></div>}

      {tab === 'mine' && savedMeals && savedMeals.length > 0 && <SavedMeals meals={savedMeals} />}

      <ul className="mt-3 flex flex-col gap-2" aria-label="Results">
        {rows.map((r) => (
          <li key={r.key}>
            <a href={r.to} className="tap flex min-h-11 items-center gap-3 rounded-2xl border border-border bg-card py-3 pl-4 pr-3" data-testid="food-row">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold">{r.name}</div>
                {r.sub && <div className="mt-0.5 truncate text-[13px] text-secondary">{r.sub}</div>}
                <div className="mt-1">
                  <SourceBadge sourceName={r.sourceName} verified={r.verified} />
                </div>
              </div>
              <div className="text-right">
                {r.kcal === null ? (
                  <div className="text-[13px] font-semibold text-secondary">No data</div>
                ) : (
                  <>
                    <div className="num text-lg font-bold">{formatNumber(r.kcal, 0)}</div>
                    <div className="text-[11px] text-secondary">kcal / 100 {r.unit}</div>
                  </>
                )}
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-border" aria-hidden="true">
                <Icon name="plus" size={18} stroke={2.2} />
              </span>
            </a>
          </li>
        ))}
      </ul>

      {tab === 'all' && q.trim() && results && results.length === 0 && rows.length === 0 && (
        <p className="mt-4 text-center text-sm text-secondary">No food matches "{q.trim()}".</p>
      )}
      {tab === 'recent' && recents && recents.length === 0 && <p className="mt-4 text-center text-sm text-secondary">Foods you log show up here.</p>}
      {tab === 'favourites' && favourites && favourites.length === 0 && <p className="mt-4 text-center text-sm text-secondary">Tap the heart on a food to keep it here.</p>}

      <div className="mt-3 flex items-center gap-3 rounded-2xl border border-dashed border-[#3A3A3E] p-3.5">
        <div className="flex-1 text-sm font-semibold">Can't find it?</div>
        <a
          href={`${href('custom')}?name=${encodeURIComponent(query.trim())}&q=${encodeURIComponent(query.trim())}`}
          className="tap flex h-11 shrink-0 items-center rounded-full bg-text px-4 text-sm font-bold text-ground"
        >
          Add custom
        </a>
      </div>
    </Page>
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
