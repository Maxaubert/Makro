// Diary: a day's entries per meal. Tap an entry to change its amount or meal, or delete it.
// Repeat yesterday copies chosen meals to today; a meal can be saved to log again in one tap.
import { useState } from 'react';
import { notYetRepeated } from '../data/fastRepeat';
import type { LocalLogEntry } from '../data/logStore';
import { buildSavedMeal, mealEntries, MEALS, type Meal } from '../domain/entry';
import { formatNumber, formatTotal } from '../domain/format';
import { browserTimeZone } from '../domain/localDate';
import { href, navigate, useApp, useData } from '../lib/hooks';
import { RepeatIcon, UnknownCount } from '../ui/icons-add-food';
import { Card, Icon, Notice, Page, PrimaryButton, Sheet } from '../ui/kit';
import { addDays, amountLabel, dayLabel, MEAL_LABEL, mealForNow, today, totalsOf } from './day';

export function Diary({ date: dateParam }: { date?: string }) {
  const app = useApp();
  const now = today();
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : now;
  const yesterday = addDays(now, -1);
  const { data } = useData(
    async () => ({ entries: await app.db.dayEntries(date), goal: await app.db.goalFor(date), previous: date === now ? await app.db.dayEntries(yesterday) : [] }),
    [date, now],
  );
  const entries = data?.entries ?? [];
  const totals = totalsOf(entries);
  const kcal = formatTotal(totals.kcal, 0);
  const goal = data?.goal ?? null;
  const repeatable = notYetRepeated(mealEntries(data?.previous ?? []), entries);
  const [repeating, setRepeating] = useState(false);
  const [saving, setSaving] = useState<Meal | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  return (
    <Page nav>
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Diary</h1>
        {repeatable.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setSaved(null);
              setRepeating(true);
            }}
            className="tap flex h-11 items-center gap-1.5 rounded-full border border-border bg-raised px-3.5 text-[13px] font-semibold"
          >
            <Icon name="repeat" size={16} stroke={2} />
            Repeat yesterday
          </button>
        )}
      </header>

      <div className="mt-2 flex items-center justify-between">
        <button type="button" aria-label="Previous day" className="tap -ml-2.5 flex h-11 w-11 items-center justify-center text-secondary" onClick={() => navigate(`/diary/${addDays(date, -1)}`)}>
          <Icon name="back" size={22} stroke={2} />
        </button>
        <div className="text-center">
          <div className="text-[17px] font-semibold">{date === now ? 'Today' : date === yesterday ? 'Yesterday' : dayLabel(date)}</div>
          <div className="text-[13px] text-secondary">{dayLabel(date)}</div>
        </div>
        <button
          type="button"
          aria-label="Next day"
          disabled={date >= now}
          className="tap -mr-2.5 flex h-11 w-11 items-center justify-center text-secondary disabled:text-strong"
          onClick={() => navigate(`/diary/${addDays(date, 1)}`)}
        >
          <Icon name="next" size={22} stroke={2} />
        </button>
      </div>

      <Card className="mt-1 rounded-2xl px-4 py-3">
        <div className="flex items-baseline justify-between text-sm text-secondary">
          <span>
            <b className="num text-2xl text-text">{kcal.text}</b> {goal ? `/ ${formatNumber(goal.kcal_target, 0)} kcal` : 'kcal'}
          </span>
          <UnknownCount count={kcal.unknown} />
        </div>
        {goal && (
          <div className="mt-2 h-2 overflow-hidden rounded bg-border">
            <div className="h-full rounded bg-accent" style={{ width: `${Math.min(100, ((totals.kcal.value ?? 0) / goal.kcal_target) * 100)}%` }} />
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(['protein_g', 'carbs_g', 'fat_g'] as const).map((n) => {
            const t = formatTotal(totals[n], 0);
            return (
              <div key={n}>
                <div className="flex items-baseline gap-1">
                  <b className="num text-[17px] text-text">{t.text}</b>
                  <span className="text-[12px] text-secondary">g</span>
                  <UnknownCount count={t.unknown} />
                </div>
                <div className="text-[12px] text-secondary">{n === 'protein_g' ? 'Protein' : n === 'carbs_g' ? 'Carbs' : 'Fat'}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {saved && (
        <p role="status" className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-accent-2">
          <Icon name="check" size={18} stroke={2.4} />
          Saved "{saved}"
        </p>
      )}

      {data && entries.length === 0 && (
        <div className="mt-10 flex flex-col items-center text-center">
          <Icon name="diary" size={36} stroke={1.6} className="text-secondary" />
          <p className="mt-2 text-[15px] font-semibold text-secondary">Nothing logged</p>
          <a href={href('add')} className="tap mt-4 inline-flex h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-sm font-bold text-ground">
            <Icon name="plus" size={18} stroke={2.4} />
            Log food
          </a>
        </div>
      )}

      <SupplementSection entries={entries} />

      {MEALS.map((meal) => {
        const rows = entries.filter((e) => e.meal === meal);
        if (rows.length === 0) return null;
        const t = formatTotal(totalsOf(rows).kcal, 0);
        return (
          <section key={meal} aria-label={MEAL_LABEL[meal]}>
            <div className="flex items-baseline justify-between pb-1.5 pt-5">
              <div className="flex items-baseline gap-3">
                <h2 className="text-[15px] font-bold text-secondary">{MEAL_LABEL[meal]}</h2>
                <button
                  type="button"
                  aria-label={`Save ${MEAL_LABEL[meal]} as a meal`}
                  onClick={() => {
                    setSaved(null);
                    setSaving(meal);
                  }}
                  className="tap -my-3 min-h-11 text-[13px] font-semibold text-accent-2"
                >
                  Save meal
                </button>
              </div>
              <span className="num text-sm text-secondary">
                {t.text} kcal
                <UnknownCount count={t.unknown} className="ml-1.5" />
              </span>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              {rows.map((e, i) => (
                <a
                  key={e.id}
                  href={href('entry', e.id)}
                  className={`tap flex items-baseline justify-between gap-3 p-4 ${i > 0 ? 'border-t border-border' : ''}`}
                  data-testid="diary-entry"
                >
                  <span className="min-w-0 text-[17px] font-semibold">
                    {e.name} <span className="text-sm font-normal text-secondary">{amountLabel(e)}</span>
                    {e.server_seq === null && (
                      <span role="img" aria-label="Not synced" title="Not synced" className="ml-1.5 inline-flex align-middle text-secondary">
                        <Icon name="cloud" size={14} />
                      </span>
                    )}
                  </span>
                  <span className="num shrink-0 text-[17px] font-bold">{formatNumber(e.kcal_total, 0)}</span>
                </a>
              ))}
            </div>
          </section>
        );
      })}

      {repeating && <RepeatSheet entries={repeatable} from={yesterday} onClose={() => setRepeating(false)} />}
      {saving && (
        <SaveMealSheet
          meal={saving}
          entries={entries.filter((e) => e.meal === saving)}
          onClose={() => setSaving(null)}
          onSaved={(name) => {
            setSaving(null);
            setSaved(name);
          }}
        />
      )}
    </Page>
  );
}

/** Pick which of yesterday's meals to copy. The meal of the moment starts selected. */
function RepeatSheet({ entries, from, onClose }: { entries: LocalLogEntry[]; from: string; onClose: () => void }) {
  const app = useApp();
  const meals = MEALS.filter((m) => entries.some((e) => e.meal === m));
  const [picked, setPicked] = useState<Meal[]>(() => meals.filter((m) => m === mealForNow()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    try {
      await app.db.repeatMeals({ from, meals: picked }, new Date(), browserTimeZone());
      await app.changed();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title="Repeat yesterday" onClose={onClose}>
      <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-ground">
        {meals.map((m, i) => {
          const t = formatTotal(totalsOf(entries.filter((e) => e.meal === m)).kcal, 0);
          const on = picked.includes(m);
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => setPicked(on ? picked.filter((p) => p !== m) : [...picked, m])}
              className={`tap flex min-h-11 w-full items-center gap-3 px-4 py-3 text-[15px] ${i > 0 ? 'border-t border-border' : ''}`}
            >
              <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${on ? 'bg-accent text-ground' : 'border border-strong'}`}>
                {on && <Icon name="check" size={12} stroke={3.5} />}
              </span>
              <span className="flex-1 text-left">{MEAL_LABEL[m]}</span>
              <span className="num text-secondary">
                {t.text} kcal
                <UnknownCount count={t.unknown} className="ml-1" />
              </span>
            </button>
          );
        })}
      </div>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className="tap h-14 rounded-full border border-border bg-raised px-[22px] text-[15px] font-semibold">Cancel</button>
        <PrimaryButton onClick={add} disabled={busy || picked.length === 0}>Add to today</PrimaryButton>
      </div>
    </Sheet>
  );
}

/** Name a diary meal so it can be logged again in one tap. */
function SaveMealSheet({ meal, entries, onClose, onSaved }: { meal: Meal; entries: LocalLogEntry[]; onClose: () => void; onSaved: (name: string) => void }) {
  const app = useApp();
  const [name, setName] = useState(MEAL_LABEL[meal]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    try {
      const built = buildSavedMeal(name, entries, new Date());
      await app.db.saveSavedMeal(built.meal, built.items);
      await app.changed();
      onSaved(built.meal.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title="Save meal" onClose={onClose}>
      <label className="mt-4 block text-[13px] text-secondary" htmlFor="meal-name">Name</label>
      <input
        id="meal-name"
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        className="mt-1.5 h-12 w-full rounded-2xl border border-border bg-ground px-4 text-[16px] outline-none focus:border-accent-2"
      />
      <p className="mt-3 text-[13px] text-secondary">{entries.map((e) => e.name).join(', ')}</p>
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={onClose} className="tap h-14 rounded-full border border-border bg-raised px-[22px] text-[15px] font-semibold">Cancel</button>
        <PrimaryButton onClick={save} disabled={busy || !name.trim()}>Save</PrimaryButton>
      </div>
    </Sheet>
  );
}

/** Daily supplements (#52): added every day, first in the day. A row opens its edit screen. */
export function SupplementSection({ entries }: { entries: readonly LocalLogEntry[] }) {
  const rows = entries.filter((e) => e.meal === 'supplements');
  if (rows.length === 0) return null;
  const t = formatTotal(totalsOf(rows).kcal, 0);
  return (
    <section aria-label="Daily supplements">
      <div className="flex items-baseline justify-between pb-1.5 pt-5">
        <h2 className="flex items-center gap-1.5 text-[15px] font-bold text-secondary">
          <RepeatIcon size={15} className="text-accent-2" />
          Daily supplements
        </h2>
        <span className="num text-sm text-secondary">
          {t.text} kcal
          <UnknownCount count={t.unknown} className="ml-1.5" />
        </span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        {rows.map((e, i) => (
          <a
            key={e.id}
            href={href('entry', e.id)}
            className={`tap flex items-baseline justify-between gap-3 p-4 ${i > 0 ? 'border-t border-border' : ''}`}
            data-testid="supplement-entry"
          >
            <span className="min-w-0 text-[17px] font-semibold">
              {e.name} <span className="text-sm font-normal text-secondary">{amountLabel(e)}</span>
              <span role="img" aria-label="Added every day" title="Added every day" className="ml-1.5 inline-flex align-middle text-accent-2">
                <RepeatIcon size={14} />
              </span>
            </span>
            <span className="num shrink-0 text-[17px] font-bold">{formatNumber(e.kcal_total, 0)}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
