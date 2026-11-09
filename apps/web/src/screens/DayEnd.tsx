// End of day (canvas B_DayEnd, #27): on target, over or under for one finished day, a warning
// when it looks incompletely logged, and the two ways out: add what is missing, or confirm it.
// An unlogged day is never treated as fasting, and unknown stays unknown (rule 2).
import { useState } from 'react';
import { MEALS } from '../domain/entry';
import { formatNumber, formatTotal } from '../domain/format';
import { dayStatus } from '../domain/guidance';
import { localMinutes, pastLocalDate } from '../domain/localDate';
import { href, navigate, useApp, useData } from '../lib/hooks';
import { Card, Icon, Notice, Page, UnknownNote } from '../ui/kit';
import { addDays, today, totalsOf, withDay } from './day';
import { amountText, dayEndTitle, dayLine, differenceText, incompleteText } from './guidanceCopy';

const MACROS = [
  { key: 'protein_g', label: 'Protein' },
  { key: 'carbs_g', label: 'Carbs' },
  { key: 'fat_g', label: 'Fat' },
] as const;

const READINGS = [
  { title: 'On target', text: 'Close to your goal.' },
  { title: 'Under or over', text: 'Below or above your goal, by how much.' },
  { title: 'May be incomplete', text: 'Few entries or a long gap. Shown next to the status.' },
  { title: 'Complete as logged', text: 'You confirmed it. The warning goes away.' },
];

export function DayEnd({ date: param }: { date?: string }) {
  const app = useApp();
  const now = today();
  const date = pastLocalDate(param ?? null, now) ?? addDays(now, -1);
  const { data, error } = useData(
    async () => ({ entries: await app.db.dayEntries(date), goal: await app.db.goalFor(date), complete: await app.db.isDayComplete(date) }),
    [date],
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  async function confirmComplete() {
    try {
      await app.db.markDayComplete(date);
      await app.changed();
      navigate('/today');
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }

  const heading = (
    <header className="flex items-center gap-2 pt-2">
      <a href={href('today')} aria-label="Back to Today" className="tap -ml-2 flex h-11 w-11 items-center justify-center">
        <Icon name="back" stroke={2} />
      </a>
      <div className="grow">
        <div className="text-[13px] text-secondary">End of day</div>
        <h1 className="text-2xl font-bold tracking-[-0.02em]">{dayLine(date)}</h1>
      </div>
    </header>
  );

  if (!data) {
    return (
      <Page>
        {heading}
        {error ? <div className="mt-3"><Notice tone="error">{error}</Notice></div> : <div className="flex-1" aria-busy="true" />}
      </Page>
    );
  }

  const { entries, goal, complete } = data;
  const kcalTarget = goal?.kcal_target ?? null;
  const status = dayStatus({
    entries: entries.map((e) => ({ kcal: e.kcal_total, eaten_minutes: localMinutes(e.eaten_at, e.tz) })),
    kcal_target: kcalTarget,
  });
  const totals = totalsOf(entries);
  const kcal = formatTotal(totals.kcal, 0);
  const notLogged = status.status === 'not_logged';
  const showWarning = status.may_be_incomplete && !complete;
  const addFood = withDay(href('add'), date);
  const minutes = entries.map((e) => localMinutes(e.eaten_at, e.tz)).filter((m): m is number => m !== null);
  const meals = MEALS.filter((m) => entries.some((e) => e.meal === m));
  const difference = differenceText(status);

  return (
    <Page>
      {heading}

      <Card className="mt-3 p-4">
        <div className="text-[13px] text-secondary">Status</div>
        <div className="mt-0.5 text-[28px] font-bold tracking-[-0.02em]" data-testid="day-end-status">
          {dayEndTitle(status.status)}
        </div>
        {status.may_be_incomplete && complete && (
          <div className="text-[13px] text-secondary" data-testid="day-end-complete">Complete as logged</div>
        )}

        {notLogged ? (
          <p className="mt-2.5 text-[14px] leading-[1.45] text-[#C8C8CC]">
            Nothing was logged this day. A day with no entries is never counted as fasting, so it has no status against your goal.
          </p>
        ) : (
          <>
            <div className="mt-2.5 flex justify-between gap-3 text-[14px] text-secondary">
              <span data-testid="day-end-eaten">
                <b className="num text-[18px] text-text">{kcal.text}</b> {kcalTarget !== null ? `of ${formatNumber(kcalTarget, 0)} kcal` : 'kcal'}
              </span>
              <span className="num" data-testid="day-end-difference">{difference}</span>
            </div>
            {kcalTarget !== null && status.eaten !== null && (
              <div className="mt-2 h-2 overflow-hidden rounded bg-border">
                <div className="h-full rounded bg-accent" style={{ width: `${Math.min(100, (status.eaten / kcalTarget) * 100)}%` }} />
              </div>
            )}
            <UnknownNote count={kcal.unknown} className="mt-1.5 block" />
            <div className="mt-3.5 grid grid-cols-3 gap-2">
              {MACROS.map((m) => (
                <div key={m.key} data-testid={`day-end-${m.key}`}>
                  <div className="text-[12px] text-secondary">{m.label}</div>
                  <div className="num text-[16px] font-bold">
                    {amountText(totals[m.key].value, m.key)} g{totals[m.key].covered < totals[m.key].count && <span className="text-[12px] font-medium text-secondary"> +?</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

      {(showWarning || notLogged) && (
        <section className="mt-3 rounded-[20px] border border-[#4A2D1C] bg-[#1E1713] p-4" data-testid="day-end-warning">
          {showWarning && (
            <>
              <div className="flex items-center gap-2.5">
                <Icon name="info" size={22} stroke={2} className="shrink-0 text-accent-2" />
                <h2 className="text-[17px] font-bold">This day may be incomplete</h2>
              </div>
              <p className="mt-2.5 text-[14px] leading-[1.45] text-[#C8C8CC]">
                {incompleteText({ status, meals, lastMinutes: minutes.length > 0 ? Math.max(...minutes) : null })}
              </p>
            </>
          )}
          <div className={`flex flex-col gap-2 ${showWarning ? 'mt-3.5' : ''}`}>
            <a href={addFood} className="tap flex h-[52px] items-center justify-center rounded-full bg-accent text-[15px] font-bold text-ground">
              Add food to {dayLine(date)}
            </a>
            {showWarning && (
              <button
                type="button"
                onClick={() => void confirmComplete()}
                className="tap flex h-[52px] items-center justify-center rounded-full border border-border bg-raised text-[15px] font-semibold"
              >
                The day is complete as logged
              </button>
            )}
          </div>
          {saveError && <div className="mt-3"><Notice tone="error">{saveError}</Notice></div>}
        </section>
      )}

      <h2 className="mt-4 text-[15px] font-bold text-secondary">How a day can read</h2>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {READINGS.map((r) => (
          <div key={r.title} className="rounded-2xl border border-border bg-card p-3">
            <div className="text-[14px] font-semibold">{r.title}</div>
            <div className="mt-0.5 text-[12px] leading-[1.35] text-secondary">{r.text}</div>
          </div>
        ))}
      </div>
    </Page>
  );
}
