// Diary: a day's entries per meal. Tap an entry to change its amount or meal, or delete it.
import { MEALS } from '../domain/entry';
import { formatNumber, formatTotal } from '../domain/format';
import { href, navigate, useApp, useData } from '../lib/hooks';
import { Card, Icon, Page, UnknownNote } from '../ui/kit';
import { addDays, amountLabel, dayLabel, MEAL_LABEL, today, totalsOf } from './day';

export function Diary({ date: dateParam }: { date?: string }) {
  const app = useApp();
  const now = today();
  const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : now;
  const { data } = useData(async () => ({ entries: await app.db.dayEntries(date), goal: await app.db.goalFor(date) }), [date]);
  const entries = data?.entries ?? [];
  const totals = totalsOf(entries);
  const kcal = formatTotal(totals.kcal, 0);
  const goal = data?.goal ?? null;

  return (
    <Page nav>
      <header className="pt-2">
        <h1 className="text-[28px] font-bold tracking-[-0.02em]">Diary</h1>
      </header>

      <div className="mt-2 flex items-center justify-between">
        <button type="button" aria-label="Previous day" className="tap -ml-2.5 flex h-11 w-11 items-center justify-center text-secondary" onClick={() => navigate(`/diary/${addDays(date, -1)}`)}>
          <Icon name="back" size={22} stroke={2} />
        </button>
        <div className="text-center">
          <div className="text-[17px] font-semibold">{date === now ? 'Today' : date === addDays(now, -1) ? 'Yesterday' : dayLabel(date)}</div>
          <div className="text-[13px] text-secondary">{dayLabel(date)}</div>
        </div>
        <button
          type="button"
          aria-label="Next day"
          disabled={date >= now}
          className="tap -mr-2.5 flex h-11 w-11 items-center justify-center text-secondary disabled:text-[#3A3A3E]"
          onClick={() => navigate(`/diary/${addDays(date, 1)}`)}
        >
          <Icon name="next" size={22} stroke={2} />
        </button>
      </div>

      <Card className="mt-1 rounded-2xl px-4 py-3">
        <div className="flex items-baseline justify-between text-sm text-secondary">
          <span>
            <b className="num text-lg text-text">{kcal.text}</b> {goal ? `of ${formatNumber(goal.kcal_target, 0)} kcal` : 'kcal'}
          </span>
          <UnknownNote count={kcal.unknown} />
        </div>
        {goal && (
          <div className="mt-2 h-2 overflow-hidden rounded bg-border">
            <div className="h-full rounded bg-accent" style={{ width: `${Math.min(100, ((totals.kcal.value ?? 0) / goal.kcal_target) * 100)}%` }} />
          </div>
        )}
        <div className="num mt-2 flex gap-4 text-[13px] text-secondary">
          {(['protein_g', 'carbs_g', 'fat_g'] as const).map((n) => {
            const t = formatTotal(totals[n], 0);
            return (
              <span key={n}>
                {n === 'protein_g' ? 'Protein' : n === 'carbs_g' ? 'Carbs' : 'Fat'} <b className="text-text">{t.text} g</b>
                {t.unknown > 0 && ' +?'}
              </span>
            );
          })}
        </div>
      </Card>

      {data && entries.length === 0 && (
        <div className="mt-10 text-center">
          <p className="text-secondary">Nothing logged {date === now ? 'yet today' : 'this day'}.</p>
          <a href={href('add')} className="tap mt-4 inline-flex h-11 items-center rounded-full bg-accent px-5 text-sm font-bold text-ground">
            Log food
          </a>
        </div>
      )}

      {MEALS.map((meal) => {
        const rows = entries.filter((e) => e.meal === meal);
        if (rows.length === 0) return null;
        const t = formatTotal(totalsOf(rows).kcal, 0);
        return (
          <section key={meal} aria-label={MEAL_LABEL[meal]}>
            <div className="flex items-baseline justify-between pb-1.5 pt-5">
              <h2 className="text-[15px] font-bold text-secondary">{MEAL_LABEL[meal]}</h2>
              <span className="num text-sm text-secondary">{t.text} kcal</span>
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
                    {e.server_seq === null && <span className="ml-1.5 text-[11px] font-normal text-secondary">not synced</span>}
                  </span>
                  <span className="num shrink-0 text-[17px] font-bold">{formatNumber(e.kcal_total, 0)}</span>
                </a>
              ))}
            </div>
          </section>
        );
      })}
    </Page>
  );
}
