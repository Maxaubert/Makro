// End of day (canvas B_DayEnd, #27): on target, over or under for one finished day, a warning
// when it looks incompletely logged, and the two ways out: add what is missing, or confirm it.
// An unlogged day is never treated as fasting, and unknown stays unknown (rule 2).
import { useState } from 'react';
import { MEALS } from '../domain/entry';
import { formatNumber, formatTotal } from '../domain/format';
import { dayStatus } from '../domain/guidance';
import { localMinutes, pastLocalDate } from '../domain/localDate';
import { href, navigate, useApp, useData } from '../lib/hooks';
import { GIcon, InfoChip, type GuidanceIconName } from '../ui/icons-today-guidance';
import { Card, Icon, Notice, Page } from '../ui/kit';
import { addDays, today, totalsOf, withDay } from './day';
import { amountText, dayEndTitle, dayLine, differenceText, incompleteMarks, missingKcalLabel, type IncompleteMark } from './guidanceCopy';

const MACROS = [
  { key: 'protein_g', label: 'Protein' },
  { key: 'carbs_g', label: 'Carbs' },
  { key: 'fat_g', label: 'Fat' },
] as const;

const MARK_ICON: Record<IncompleteMark['kind'], GuidanceIconName> = { last: 'clock', no_dinner: 'moon', long_gap: 'gap', few: 'list', missing: 'partial' };

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[28px] font-bold tracking-[-0.02em]" data-testid="day-end-status">
            {dayEndTitle(status.status)}
          </div>
          {status.may_be_incomplete && complete && (
            <span className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-raised px-2.5 text-[13px] font-semibold text-soft">
              <GIcon name="check" size={14} className="text-accent-2" />
              <span data-testid="day-end-complete">Complete as logged</span>
            </span>
          )}
        </div>

        {notLogged ? (
          <p className="mt-1.5 text-[14px] text-soft">Never counted as fasting.</p>
        ) : (
          <>
            <div className="mt-2.5 flex items-baseline justify-between gap-3 text-[14px] text-secondary">
              <span data-testid="day-end-eaten">
                <b className="num text-[22px] text-text">{kcal.text}</b> {kcalTarget !== null ? `of ${formatNumber(kcalTarget, 0)} kcal` : 'kcal'}
              </span>
              <span className="num font-semibold text-soft" data-testid="day-end-difference">{difference}</span>
            </div>
            {kcalTarget !== null && status.eaten !== null && (
              <div className="mt-2 h-2 overflow-hidden rounded bg-border">
                <div className="h-full rounded bg-accent" style={{ width: `${Math.min(100, (status.eaten / kcalTarget) * 100)}%` }} />
              </div>
            )}
            {kcal.unknown > 0 && (
              <div className="mt-2">
                <InfoChip
                  icon="partial"
                  tone="warn"
                  testId="day-end-unknown"
                  label={missingKcalLabel(kcal.unknown, totals.kcal.count)}
                >
                  {totals.kcal.covered}/{totals.kcal.count}
                </InfoChip>
              </div>
            )}
            <div className="mt-3.5 grid grid-cols-3 gap-2">
              {MACROS.map((m) => (
                <div key={m.key} data-testid={`day-end-${m.key}`}>
                  <div className="text-[12px] text-secondary">{m.label}</div>
                  <div className="num text-[18px] font-bold">
                    {amountText(totals[m.key].value, m.key)} g
                    {totals[m.key].covered < totals[m.key].count && (
                      <span className="text-[12px] font-medium text-accent-2" title="Some entries have no value"> +?</span>
                    )}
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
                <h2 className="text-[17px] font-bold">May be incomplete</h2>
              </div>
              <ul className="mt-2.5 flex flex-wrap gap-1.5" data-testid="day-end-reasons">
                {incompleteMarks({ status, meals, lastMinutes: minutes.length > 0 ? Math.max(...minutes) : null }).map((mark) => (
                  <li key={mark.kind}>
                    <InfoChip icon={MARK_ICON[mark.kind]} label={mark.label}>
                      {mark.text}
                    </InfoChip>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[13px] text-secondary">Never counted as fasting.</p>
            </>
          )}
          <div className={`flex flex-col gap-2 ${showWarning ? 'mt-3.5' : ''}`}>
            <a href={addFood} className="tap flex h-[52px] items-center justify-center gap-2 rounded-full bg-accent text-[15px] font-bold text-ground">
              <Icon name="plus" size={18} stroke={2.4} />
              Add food to {dayLine(date)}
            </a>
            {showWarning && (
              <button
                type="button"
                onClick={() => void confirmComplete()}
                className="tap flex h-[52px] items-center justify-center gap-2 rounded-full border border-border bg-raised text-[15px] font-semibold"
              >
                <Icon name="check" size={18} stroke={2.2} />
                Complete as logged
              </button>
            )}
          </div>
          {saveError && <div className="mt-3"><Notice tone="error">{saveError}</Notice></div>}
        </section>
      )}
    </Page>
  );
}
