// The guidance cards of Today (canvas B_Today, #27, #53): yesterday's end-of-day status, what is
// left today with suggestions, and the weekly average. The maths is in domain/guidance.ts.
import { useState } from 'react';
import type { GoalRow, LocalLogEntry } from '../data/logStore';
import type { FoodSuggestion } from '../data/suggestions';
import {
  REMAINING_MEASURES,
  WEEKLY_MEASURES,
  dayStatus,
  remainingToday,
  weekWindow,
  weeklyAverage,
  type RemainingKey,
  type WeeklyMeasureKey,
} from '../domain/guidance';
import { localMinutes } from '../domain/localDate';
import { href, useApp, useAppState, useData } from '../lib/hooks';
import { Card, Icon, SourceBadge } from '../ui/kit';
import { addDays, amountLabel, totalsOf } from './day';
import {
  VERDICT_LABEL,
  amountText,
  coverageNote,
  dayLine,
  dayStatusLine,
  leftOutNote,
  remainingText,
  weekRange,
  weekday,
  weeklyHeadline,
} from './guidanceCopy';

const REMAINING_LABEL: Record<RemainingKey, string> = { kcal: 'kcal', protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fat' };
const MEASURE_LABEL: Record<WeeklyMeasureKey, string> = { kcal: 'Calories', protein_g: 'Protein', carbs_g: 'Carbs', fat_g: 'Fat', fibre_g: 'Fibre' };

const targetsOf = (goal: GoalRow | null): Record<WeeklyMeasureKey, number | null> => ({
  kcal: goal?.kcal_target ?? null,
  protein_g: goal?.protein_g_target ?? null,
  carbs_g: goal?.carbs_g_target ?? null,
  fat_g: goal?.fat_g_target ?? null,
  fibre_g: goal?.fibre_g_target ?? null,
});

export function GuidanceCards({ date, entries, goal }: { date: string; entries: LocalLogEntry[]; goal: GoalRow | null }) {
  const app = useApp();
  const yesterday = addDays(date, -1);
  const { data } = useData(async () => {
    const dates = weekWindow(date);
    return {
      week: dates.length > 0 ? await app.db.entriesBetween(dates[0], dates[dates.length - 1]) : [],
      yesterday: await app.db.dayEntries(yesterday),
      yesterdayGoal: await app.db.goalFor(yesterday),
    };
  }, [date]);
  return (
    <>
      {data && <YesterdayRow date={yesterday} entries={data.yesterday} kcalTarget={data.yesterdayGoal?.kcal_target ?? null} />}
      {goal && <WhatIsLeft entries={entries} goal={goal} />}
      {data && <WeeklyCard today={date} entries={data.week} goal={goal} />}
    </>
  );
}

function YesterdayRow({ date, entries, kcalTarget }: { date: string; entries: LocalLogEntry[]; kcalTarget: number | null }) {
  const status = dayStatus({
    entries: entries.map((e) => ({ kcal: e.kcal_total, eaten_minutes: localMinutes(e.eaten_at, e.tz) })),
    kcal_target: kcalTarget,
  });
  const line = dayStatusLine(status);
  if (line === null) return null;
  return (
    <a href={href('diary', date)} className="card tap mt-3 flex items-center gap-3 px-4 py-3.5" data-testid="yesterday-row">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-2" aria-hidden="true" />
      <div className="min-w-0 grow">
        <div className="text-[12px] text-secondary">Yesterday, {dayLine(date)}</div>
        <div className="mt-0.5 text-[15px] font-semibold">{line}</div>
      </div>
      <Icon name="next" size={18} stroke={2} className="text-secondary" />
    </a>
  );
}

function WhatIsLeft({ entries, goal }: { entries: LocalLogEntry[]; goal: GoalRow }) {
  const app = useApp();
  const { products } = useAppState();
  const left = remainingToday(totalsOf(entries), targetsOf(goal));
  const gap = Object.fromEntries(REMAINING_MEASURES.map((k) => [k, left[k].left])) as Record<RemainingKey, number | null>;
  const ready = products.status === 'ready';
  const { data: suggestions } = useData(() => app.db.suggestions(gap), [gap.kcal, gap.protein_g, gap.carbs_g, gap.fat_g, ready]);
  const hasRoom = gap.kcal !== null && gap.kcal > 0;
  const anyBound = REMAINING_MEASURES.some((k) => left[k].left !== null && !left[k].exact);

  return (
    <Card className="mt-3 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">What is left today</h2>
        <span className="text-[12px] text-secondary">Up to 3 ideas</span>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {REMAINING_MEASURES.map((k) => {
          const t = remainingText(left[k], k);
          return (
            <div key={k} className="rounded-xl border border-border bg-ground px-1.5 py-2 text-center" data-testid={`left-${k}`}>
              <div className="num text-[17px] font-bold">{t.value}</div>
              <div className="mt-px text-[11px] text-secondary">{t.over ? `${REMAINING_LABEL[k]} over` : REMAINING_LABEL[k]}</div>
            </div>
          );
        })}
      </div>
      {anyBound && <p className="mt-2 text-[12px] text-secondary">≤ and ≥ mark amounts where some entries have no value.</p>}
      {hasRoom && suggestions && suggestions.length > 0 && (
        <>
          <div className="mt-3.5 text-[13px] text-secondary">Fits what is left</div>
          <ul>
            {suggestions.map((s, i) => (
              <SuggestionRow key={`${s.kind}/${s.id}`} s={s} first={i === 0} />
            ))}
          </ul>
          <p className="mt-1 text-[12px] text-secondary">Amounts come from your own entries and the product database. Pick one, a few or none.</p>
        </>
      )}
      {hasRoom && suggestions && suggestions.length === 0 && (
        <p className="mt-3.5 text-[13px] text-secondary">Nothing in your history or the verified products fits what is left.</p>
      )}
    </Card>
  );
}

function SuggestionRow({ s, first }: { s: FoodSuggestion; first: boolean }) {
  // A verified product was never logged, so the portion screen is told which amount was shown.
  const to = `${href('portion', s.kind, s.id)}${s.tier === 'verified' ? `?amount=${encodeURIComponent(s.quantity)}` : ''}`;
  const brandAndSource = [...new Set([s.brand, s.source_name].filter(Boolean))].join(' · ');
  return (
    <li className={first ? '' : 'border-t border-border'}>
      <a href={to} className="tap flex items-center gap-3 py-2.5">
        <div className="min-w-0 grow">
          <div className="text-[15px] font-semibold">
            {s.name} <span className="text-[13px] font-normal text-secondary">{amountLabel(s)}</span>
          </div>
          <div className="num mt-0.5 text-[13px] text-[#C8C8CC]">
            {amountText(s.kcal, 'kcal')} kcal · {amountText(s.protein_g, 'protein_g')} g protein
          </div>
          {s.tier === 'history' ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-secondary">
              <span>From your history</span>
              <SourceBadge sourceName={s.source_name} verified={s.verified} />
            </div>
          ) : (
            <div className="mt-0.5 flex items-center gap-1 text-[12px] text-secondary">
              <Icon name="check" size={12} stroke={3} className="text-accent-2" />
              <span>Verified product · {brandAndSource}</span>
            </div>
          )}
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-border" aria-hidden="true">
          <Icon name="plus" size={18} stroke={2.2} />
        </span>
      </a>
    </li>
  );
}

const BAR_HEIGHT = 90;

function WeeklyCard({ today, entries, goal }: { today: string; entries: LocalLogEntry[]; goal: GoalRow | null }) {
  const [selected, setSelected] = useState<WeeklyMeasureKey>('protein_g');
  const byDate = new Map<string, LocalLogEntry[]>();
  for (const e of entries) byDate.set(e.local_date, [...(byDate.get(e.local_date) ?? []), e]);
  const targets = targetsOf(goal);
  const week = weeklyAverage({
    today,
    targets,
    days: [...byDate].map(([local_date, day]) => ({
      local_date,
      items: day.map((e) => Object.fromEntries(WEEKLY_MEASURES.map((n) => [n, e[`${n}_total`]]))),
    })),
  });
  const m = week.measures[selected];
  const unit = selected === 'kcal' ? 'kcal' : 'g';
  const target = targets[selected];
  const head = weeklyHeadline(m, selected);

  const knownValues = m.days.map((d) => d.value).filter((v): v is number => v !== null);
  const top = Math.max(target !== null ? target * 1.25 : 0, ...knownValues, 1);
  const barPx = (v: number) => Math.max(2, Math.round((v / top) * BAR_HEIGHT));

  return (
    <Card className="mt-3 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-semibold">Weekly average</h2>
        <span className="text-[12px] text-secondary">{weekRange(week.dates)}</span>
      </div>
      {week.dates.length === 0 ? (
        <p className="mt-2 text-[13px] text-secondary">The week starts today. The average begins tomorrow.</p>
      ) : week.counted_days === 0 ? (
        <p className="mt-2 text-[13px] text-secondary">No logged meals earlier this week.</p>
      ) : (
        <>
          <p className="mt-0.5 text-[12px] text-secondary">{leftOutNote(week)}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {WEEKLY_MEASURES.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={k === selected}
                aria-label={`Show ${MEASURE_LABEL[k]}`}
                onClick={() => setSelected(k)}
                className={`tap flex h-[34px] items-center rounded-full px-2.5 text-[12px] ${
                  k === selected ? 'bg-text font-bold text-ground' : 'border border-border bg-raised text-[#C8C8CC]'
                }`}
              >
                {MEASURE_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="mt-3.5 flex items-end justify-between">
            <div>
              <div className="text-[12px] text-secondary">{head.caption}</div>
              <div className="num text-[36px] font-bold leading-[1.1] tracking-[-0.03em]" data-testid="weekly-average">
                {head.value}
                <span className="text-[16px] font-medium tracking-normal text-secondary"> {unit}</span>
              </div>
            </div>
            <div className="text-right">
              {m.verdict && (
                <div className="inline-flex h-[30px] items-center gap-1.5 rounded-full border border-border bg-raised px-3 text-[13px] font-semibold" data-testid="weekly-verdict">
                  <span className="h-2 w-2 rounded-full bg-accent-2" aria-hidden="true" />
                  {VERDICT_LABEL[m.verdict]}
                </div>
              )}
              <div className="mt-1 text-[12px] text-secondary">
                {target !== null ? `Target ${amountText(target, selected)} ${unit}` : 'No goal set'}
              </div>
            </div>
          </div>
          <div
            className="relative mt-3.5 h-[116px]"
            role="img"
            aria-label={m.days.map((d) => `${weekday(d.local_date)} ${d.logged ? `${amountText(d.value, selected)} ${unit}` : 'no logged meal'}`).join(', ')}
          >
            {target !== null && (
              <div
                className="absolute inset-x-0 h-0 border-t border-dashed border-[#C8C8CC]"
                style={{ bottom: Math.round((target / top) * BAR_HEIGHT) }}
              />
            )}
            <div className="absolute inset-0 flex gap-2.5">
              {m.days.map((d) => (
                <div key={d.local_date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  <div className="num mb-[3px] text-[11px] text-secondary">{d.logged ? amountText(d.value, selected) : 'None'}</div>
                  {d.value !== null && <div className="w-3/5 max-w-[34px] rounded bg-accent opacity-70" style={{ height: barPx(d.value) }} />}
                </div>
              ))}
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="mt-1.5 flex gap-2.5">
            {m.days.map((d) => (
              <div key={d.local_date} className="flex-1 text-center text-[11px] text-secondary">
                {weekday(d.local_date)}
              </div>
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[12px] text-[#C8C8CC]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-[2px] bg-accent opacity-70" />
              Day total
            </span>
            {target !== null && (
              <span className="flex items-center gap-1.5">
                <span className="h-0 w-4 border-t border-dashed border-[#C8C8CC]" />
                Target
              </span>
            )}
          </div>
          <p className="mt-2 text-[12px] leading-[1.4] text-secondary" data-testid="weekly-coverage">
            {coverageNote(m, selected)}
          </p>
        </>
      )}
    </Card>
  );
}
