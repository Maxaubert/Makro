// The guidance cards of Today (canvas B_Today, #27, #53): yesterday's end-of-day status, what is
// left today with suggestions, and the weekly average. The maths is in domain/guidance.ts.
// Decision 46: numbers, bars and chips; the full meaning sits in aria labels, not in captions.
import { useState } from 'react';
import { MacroRing } from './MacroRing';
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
  type Verdict,
  type WeeklyMeasureKey,
} from '../domain/guidance';
import { localMinutes } from '../domain/localDate';
import { href, useApp, useAppState, useData } from '../lib/hooks';
import { GIcon, InfoChip, type GuidanceIconName } from '../ui/icons-today-guidance';
import { Card, Icon, SourceBadge } from '../ui/kit';
import { addDays, amountLabel, totalsOf } from './day';
import {
  VERDICT_LABEL,
  amountText,
  coverageNote,
  dayEndTitle,
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
const VERDICT_ICON: Record<Verdict, GuidanceIconName> = { on_target: 'check', a_bit_under: 'down', well_under: 'down', above_target: 'up' };

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
      yesterdayComplete: await app.db.isDayComplete(yesterday),
    };
  }, [date]);
  return (
    <>
      {data && <YesterdayRow date={yesterday} entries={data.yesterday} kcalTarget={data.yesterdayGoal?.kcal_target ?? null} confirmedComplete={data.yesterdayComplete} />}
      {goal && <WhatIsLeft entries={entries} goal={goal} />}
      {data && <WeeklyCard today={date} entries={data.week} goal={goal} />}
    </>
  );
}

function YesterdayRow({ date, entries, kcalTarget, confirmedComplete }: { date: string; entries: LocalLogEntry[]; kcalTarget: number | null; confirmedComplete: boolean }) {
  const status = dayStatus({
    entries: entries.map((e) => ({ kcal: e.kcal_total, eaten_minutes: localMinutes(e.eaten_at, e.tz) })),
    kcal_target: kcalTarget,
  });
  const line = dayStatusLine(status, confirmedComplete);
  if (line === null) return null;
  const incomplete = status.may_be_incomplete && !confirmedComplete;
  return (
    <a
      href={href('day-end', date)}
      aria-label={`Yesterday, ${dayLine(date)}: ${line}`}
      className="card tap mt-3 flex min-h-[56px] items-center gap-3 px-4 py-3"
      data-testid="yesterday-row"
    >
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent-2" aria-hidden="true" />
      <span className="text-[13px] text-secondary">Yesterday</span>
      <span className="min-w-0 grow truncate text-[16px] font-semibold">{dayEndTitle(status.status)}</span>
      {incomplete && (
        <span title="May be incomplete" data-testid="yesterday-incomplete" className="text-accent-2">
          <GIcon name="alert" size={18} />
        </span>
      )}
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

  return (
    <Card className="mt-3 p-4">
      <h2 className="text-[15px] font-semibold">What is left today</h2>
      <div className="mt-3 grid grid-cols-4 gap-1.5">
        {REMAINING_MEASURES.map((k) => {
          const t = remainingText(left[k], k);
          // ≤ and ≥ mark a bound when some entries have no value (rule 2); the tile's title says so.
          const bound = left[k].left !== null && !left[k].exact;
          return (
            <div
              key={k}
              className="rounded-xl border border-border bg-ground px-1.5 py-2 text-center"
              data-testid={`left-${k}`}
              title={bound ? 'Some entries have no value' : undefined}
            >
              <div className="num text-[17px] font-bold">{t.value}</div>
              <div className="mt-px text-[11px] text-secondary">{t.over ? `${REMAINING_LABEL[k]} over` : REMAINING_LABEL[k]}</div>
            </div>
          );
        })}
      </div>
      {hasRoom && suggestions && suggestions.length > 0 && (
        <>
          <div className="mt-3.5 text-[13px] text-secondary">Fits what is left</div>
          <ul>
            {suggestions.map((s, i) => (
              <SuggestionRow key={`${s.kind}/${s.id}`} s={s} first={i === 0} />
            ))}
          </ul>
        </>
      )}
      {hasRoom && suggestions && suggestions.length === 0 && <p className="mt-3.5 text-[13px] text-secondary">Nothing fits</p>}
    </Card>
  );
}

function SuggestionRow({ s, first }: { s: FoodSuggestion; first: boolean }) {
  // A verified product was never logged, so the portion screen is told which amount was shown.
  const to = `${href('portion', s.kind, s.id)}${s.tier === 'verified' ? `?amount=${encodeURIComponent(s.quantity)}` : ''}`;
  const source = [...new Set([s.brand, s.source_name].filter(Boolean))].join(' · ');
  return (
    <li className={first ? '' : 'border-t border-border'}>
      <a href={to} className="tap flex min-h-[56px] items-center gap-3 py-2.5" data-testid={s.tier === 'verified' ? 'suggestion-verified' : 'suggestion-history'}>
        <div className="min-w-0 grow">
          <div className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold">
            <span className="truncate">{s.name}</span>
            <SourceBadge sourceName={source} verified={s.verified} />
            {s.tier === 'history' && (
              <span role="img" aria-label="From your history" title="From your history" className="text-secondary">
                <GIcon name="history" size={14} />
              </span>
            )}
          </div>
          <div className="num mt-0.5 text-[13px] text-soft">
            {amountLabel(s)} · {amountText(s.kcal, 'kcal')} kcal · {amountText(s.protein_g, 'protein_g')} g protein
          </div>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-border" aria-hidden="true">
          <Icon name="plus" size={18} stroke={2.2} />
        </span>
      </a>
    </li>
  );
}

const RING_MEASURES = [...WEEKLY_MEASURES, 'sugars_g', 'sat_fat_g'] as const;
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
      items: day.map((e) => Object.fromEntries(RING_MEASURES.map((n) => [n, e[`${n}_total`]]))),
    })),
  }, RING_MEASURES);
  // Calories and the three macros are in the ring; the big number shows only for the other measures.
  const inRing = selected === 'kcal' || selected === 'protein_g' || selected === 'carbs_g' || selected === 'fat_g';
  const m = week.measures[selected];
  const unit = selected === 'kcal' ? 'kcal' : 'g';
  const target = targets[selected];
  const head = weeklyHeadline(m, selected);

  const knownValues = m.days.map((d) => d.value).filter((v): v is number => v !== null);
  const top = Math.max(target !== null ? target * 1.25 : 0, ...knownValues, 1);
  const barPx = (v: number) => Math.max(2, Math.round((v / top) * BAR_HEIGHT));
  const fill = target !== null && target > 0 && m.average !== null ? Math.min(1, m.average / target) : null;
  const range = weekRange(week.dates);

  return (
    <Card className="mt-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">Weekly average</h2>
        {week.dates.length > 0 && (
          <InfoChip icon="calendar" label={`${range}. ${leftOutNote(week)}`} testId="weekly-days" tone={week.left_out.length > 0 ? 'warn' : 'plain'}>
            {week.counted_days}/{week.dates.length}
          </InfoChip>
        )}
      </div>
      {week.dates.length === 0 || week.counted_days === 0 ? (
        <div className="mt-3 flex items-center gap-2 text-[15px] font-semibold text-secondary">
          <GIcon name="calendar" size={18} />
          {week.dates.length === 0 ? 'From tomorrow' : 'No meals yet'}
        </div>
      ) : (
        <>
          <div className="mt-3">
            <MacroRing week={week} targets={{ kcal: targets.kcal ?? undefined, protein_g: targets.protein_g ?? undefined, carbs_g: targets.carbs_g ?? undefined, fat_g: targets.fat_g ?? undefined }} />
          </div>
          <div className="mt-4 flex flex-wrap gap-1">
            {WEEKLY_MEASURES.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={k === selected}
                aria-label={`Show ${MEASURE_LABEL[k]}`}
                onClick={() => setSelected(k)}
                className={`tap relative flex h-[34px] items-center rounded-full px-2.5 text-[12px] after:absolute after:inset-x-0 after:-inset-y-[5px] after:content-[''] ${
                  k === selected ? 'bg-text font-bold text-ground' : 'border border-border bg-raised text-soft'
                }`}
              >
                {MEASURE_LABEL[k]}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-end justify-between gap-2">
            {inRing ? <span /> : (
              <div className="num text-[40px] font-bold leading-none tracking-[-0.03em]" data-testid="weekly-average" aria-label={`${MEASURE_LABEL[selected]}: ${head.label} ${unit}`}>
                {head.value}
                <span className="text-[16px] font-medium tracking-normal text-secondary"> {unit}</span>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {/* Only when some entries had no value: then the average is a lower bound (accuracy rule 2). */}
              {m.covered < m.count && (
                <InfoChip icon="partial" label={coverageNote(m, selected)} testId="weekly-coverage" tone="warn">
                  {m.covered}/{m.count}
                </InfoChip>
              )}
              {m.verdict && (
                <span className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-raised px-2.5 text-[13px] font-semibold" data-testid="weekly-verdict">
                  <GIcon name={VERDICT_ICON[m.verdict]} size={14} className="text-accent-2" />
                  {VERDICT_LABEL[m.verdict]}
                </span>
              )}
            </div>
          </div>
          {target !== null && !inRing && (
            <div className="mt-3 flex items-center gap-2" data-testid="weekly-target">
              <div
                className="h-2 grow overflow-hidden rounded bg-border"
                role="img"
                aria-label={`Target ${amountText(target, selected)} ${unit}`}
              >
                {fill !== null && <div className="h-full rounded bg-accent" style={{ width: `${Math.round(fill * 100)}%` }} />}
              </div>
              <span className="num flex items-center gap-1 text-[12px] text-secondary">
                <Icon name="goals" size={13} stroke={2} />
                {amountText(target, selected)}
              </span>
            </div>
          )}
          <div
            className="relative mt-3.5 h-[116px]"
            role="img"
            aria-label={m.days
              .map((d) => `${weekday(d.local_date)} ${d.logged ? `${amountText(d.value, selected)} ${unit}${d.covered < d.count ? ` or more, ${d.count - d.covered} without a value` : ''}` : 'no logged meal'}`)
              .join(', ')}
          >
            {target !== null && (
              <div className="absolute inset-x-0 h-0 border-t border-dashed border-soft" style={{ bottom: Math.round((target / top) * BAR_HEIGHT) }} />
            )}
            <div className="absolute inset-0 flex gap-2.5">
              {m.days.map((d) => (
                <div key={d.local_date} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end">
                  {d.logged && (
                    <div className="num mb-[3px] text-[11px] text-secondary">
                      {amountText(d.value, selected)}
                      {d.value !== null && d.covered < d.count && <span className="text-accent-2">+?</span>}
                    </div>
                  )}
                  {d.value !== null ? (
                    <div className="w-3/5 max-w-[34px] rounded bg-accent opacity-70" style={{ height: barPx(d.value) }} />
                  ) : (
                    <div className="h-1 w-3/5 max-w-[34px] rounded border border-dashed border-faint" />
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="h-px bg-border" />
          <div className="mt-1.5 flex gap-2.5">
            {m.days.map((d) => (
              <div key={d.local_date} className={`flex-1 text-center text-[11px] ${d.logged ? 'text-secondary' : 'text-faint'}`}>
                {weekday(d.local_date)}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
