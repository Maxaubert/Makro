// D_Diary: the day list with the week, the picked day with its meals in a table and an inline
// edit, and the weekly average with the top sources. The route holds the picked day.
import { useState } from 'react';
import { MacroRing } from '../MacroRing';
import { notYetRepeated } from '../../data/fastRepeat';
import type { GoalRow, LocalLogEntry } from '../../data/logStore';
import { isMeal, mealEntries, MEALS, type Meal } from '../../domain/entry';
import { formatNumber, formatTotal } from '../../domain/format';
import { daySkip, remainingToday, weekWindow, weeklyAverage, type DayChoice, type Verdict, type WeeklyDay, type WeeklyMeasure } from '../../domain/guidance';
import { browserTimeZone } from '../../domain/localDate';
import { NUTRIENTS, type Nutrient } from '../../domain/nutrients';
import { href, navigate, useApp, useData } from '../../lib/hooks';
import { DesktopShell } from '../../ui/desktop';
import { CountChip, HomeIcon, UnknownChip } from '../../ui/icons-desktop-home';
import { Icon, Notice, SourceBadge } from '../../ui/kit';
import { addDays, amountLabel, DIARY_GROUPS, GROUP_LABEL, longDayLabel, MEAL_LABEL, today, totalsOf, withDay } from '../day';
import { SKIPPED_BAR, dayStatusLabel } from '../dayChoice';
import { VERDICT_LABEL, amountText, remainingText, weekRange, weekday } from '../guidanceCopy';
import { canPageForward, dayRowSummary, listWindow, pageDay, parsedQuantity, previewEntry, steppedAmount, topSources } from './diaryView';
import { daysLabel, ofText } from './trendsCopy';

const TABLE_COLUMNS = 'grid grid-cols-[minmax(0,1fr)_64px_64px_64px_72px] gap-2';
const MEAL_COLORS: Record<Meal, string> = { breakfast: '#FF4C00', lunch: '#FF8A57', dinner: '#FFB38F', snack: '#7A7A80' };

const MACRO_TILES = [
  { key: 'carbs_g', label: 'Carbs', target: 'carbs_g_target', color: 'var(--color-accent-2)' },
  { key: 'fat_g', label: 'Fat', target: 'fat_g_target', color: 'var(--color-accent-3)' },
  { key: 'protein_g', label: 'Protein', target: 'protein_g_target', color: 'var(--color-accent)' },
  { key: 'fibre_g', label: 'Fibre', target: 'fibre_g_target', color: 'var(--color-muted)' },
] as const;

const MEASURES: { key: Nutrient; label: string; group: string }[] = [
  { key: 'kcal', label: 'Calories', group: 'Macros' },
  { key: 'protein_g', label: 'Protein', group: 'Macros' },
  { key: 'carbs_g', label: 'Carbs', group: 'Macros' },
  { key: 'fat_g', label: 'Fat', group: 'Macros' },
  { key: 'sat_fat_g', label: 'Saturated fat', group: 'Macros' },
  { key: 'sugars_g', label: 'Sugars', group: 'Macros' },
  { key: 'fibre_g', label: 'Fibre', group: 'Macros' },
  { key: 'salt_g', label: 'Salt', group: 'Minerals and other' },
];
const MEASURE_GROUPS = ['Macros', 'Minerals and other'];

// The panel's choices outlive a day change (the route remounts this screen for each day) and a reload.
interface Prefs {
  measure: Nutrient;
  enabled: Nutrient[];
}
const PREFS_KEY = 'makro.diary.measures';
const DEFAULT_PREFS: Prefs = { measure: 'protein_g', enabled: ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'fibre_g'] };

function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<Prefs> | null;
    const enabled = saved?.enabled?.filter((k) => NUTRIENTS.includes(k)) ?? [];
    if (saved?.measure && NUTRIENTS.includes(saved.measure) && enabled.length > 0) return { measure: saved.measure, enabled };
  } catch {
    // Blocked or damaged storage: the defaults are fine.
  }
  return DEFAULT_PREFS;
}

let currentPrefs: Prefs | null = null;

function usePrefs(): [Prefs, (next: Prefs) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() => (currentPrefs ??= loadPrefs()));
  return [
    prefs,
    (next) => {
      currentPrefs = next;
      setPrefs(next);
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        // Kept for this visit only.
      }
    },
  ];
}

interface EditState {
  id: string;
  quantity: string;
  meal: Meal;
}

function monthLabel(localDate: string): string {
  const [y, m] = localDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

const dayOfMonth = (localDate: string): number => Number(localDate.split('-')[2]);
const unitOf = (key: Nutrient): string => (key === 'kcal' ? 'kcal' : 'g');
const withUnknown = (t: { text: string; unknown: number }): string => `${t.text}${t.unknown > 0 ? ' +?' : ''}`;

function targetsOf(goal: GoalRow | null): Partial<Record<Nutrient, number>> {
  if (!goal) return {};
  return { kcal: goal.kcal_target, protein_g: goal.protein_g_target, carbs_g: goal.carbs_g_target, fat_g: goal.fat_g_target, fibre_g: goal.fibre_g_target };
}

export function DesktopDiary({ date: dateParam }: { date?: string }) {
  const app = useApp();
  const now = today();
  const requested = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : now;
  const yesterday = addDays(now, -1);

  // The screen stays mounted from day to day (routes.tsx gives it no key), and keeps showing the day it
  // last read until the next one is read, then switches in one go. Nothing empties and refills, so the
  // layout does not jump when a day, a bar or the sidebar is clicked (Max, 2026-11-14).
  const { data, error: readError } = useData(async () => {
    const listDays = listWindow(requested, now);
    const weekDays = weekWindow(requested);
    const [entries, goal, previous, listed, listGoals, weekEntries, choices, dayChoice] = await Promise.all([
      app.db.dayEntries(requested),
      app.db.goalFor(requested),
      requested === now ? app.db.dayEntries(yesterday) : Promise.resolve([]),
      app.db.entriesBetween(listDays[6], listDays[0]),
      Promise.all(listDays.map((d) => app.db.goalFor(d))),
      weekDays.length > 0 ? app.db.entriesBetween(weekDays[0], weekDays[weekDays.length - 1]) : Promise.resolve([]),
      weekDays.length > 0 ? app.db.dayChoices(weekDays[0], weekDays[weekDays.length - 1]) : Promise.resolve({} as Record<string, DayChoice>),
      app.db.dayChoices(requested, requested),
    ]);
    return { date: requested, entries, goal, previous, listed, listGoals, weekEntries, choices, dayChoice: dayChoice[requested] };
  }, [requested, now]);
  const date = data?.date ?? requested;
  const days = listWindow(date, now);

  const [editing, setEditing] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // An open edit or an error belongs to the day it was made on.
  const [editedDay, setEditedDay] = useState(requested);
  if (editedDay !== requested) {
    setEditedDay(requested);
    setEditing(null);
    setProblem(null);
  }

  const stored = data?.entries ?? [];
  const open = editing ? stored.find((e) => e.id === editing.id) ?? null : null;
  const draftQuantity = editing ? parsedQuantity(editing.quantity) : null;
  // Totals, meals and the panel follow the edit while it is open; Cancel simply drops it.
  const entries = open && editing ? stored.map((e) => (e.id === open.id ? previewEntry(e, { quantity: draftQuantity, meal: editing.meal }) : e)) : stored;
  const goal = data?.goal ?? null;
  const repeatable = date === now ? notYetRepeated(mealEntries(data?.previous ?? []), stored) : [];

  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setProblem(null);
    try {
      await work();
      await app.changed();
      setEditing(null);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const repeat = () => run(() => app.db.repeatMeals({ from: yesterday, meals: [...new Set(repeatable.map((e) => e.meal))] }, new Date(), browserTimeZone()));
  const pick = (entry: LocalLogEntry) => {
    setProblem(null);
    if (!isMeal(entry.meal)) return;
    setEditing(editing?.id === entry.id ? null : { id: entry.id, quantity: String(entry.quantity), meal: entry.meal });
  };

  return (
    <DesktopShell active="diary" title="Diary">
      {/* Three columns from the board's width down to 1360 px; narrower, the panel moves under the day. */}
      <div className="grid grid-cols-[244px_minmax(0,1fr)] items-start gap-5 min-[1360px]:grid-cols-[244px_minmax(0,1fr)_300px]">
        <DayList date={date} now={now} days={days} listed={data?.listed} goals={data?.listGoals} week={data ? weekOf(date, data.weekEntries, goal, data.choices).measures.kcal : null} />

        <section className="flex min-w-0 flex-col gap-5">
          {readError && <Notice tone="error">{readError}</Notice>}
          {problem && <Notice tone="error">{problem}</Notice>}
          <DayCard
            date={date}
            now={now}
            entries={entries}
            goal={goal}
            canRepeat={repeatable.length > 0}
            repeating={busy}
            onRepeat={repeat}
            skipped={data && stored.length > 0 ? daySkip(stored.map((e) => ({ kcal: e.kcal_total })), goal?.kcal_target, data.dayChoice) : undefined}
            onTrack={(choice) => void run(() => app.db.setDayChoice(date, choice))}
          />
          {data && (
            <MealTable
              date={date}
              now={now}
              entries={entries}
              stored={stored}
              editing={editing}
              valid={draftQuantity !== null}
              busy={busy}
              onPick={pick}
              onChange={setEditing}
              onCancel={() => {
                setProblem(null);
                setEditing(null);
              }}
              onDone={() => {
                if (editing && draftQuantity !== null) void run(() => app.db.updateLogEntry(editing.id, { quantity: draftQuantity, meal: editing.meal }));
              }}
              onDelete={() => {
                if (editing) void run(() => app.db.tombstone('log_entries', editing.id));
              }}
            />
          )}
        </section>

        {data && (
          <WeeklyPanel
            date={date}
            now={now}
            entries={entries}
            weekEntries={data.weekEntries}
            goal={goal}
            choices={data.choices}
          />
        )}
      </div>
    </DesktopShell>
  );
}

/** The weekly average of the days before `date`, the same sums as the Today card. */
function weekOf(date: string, weekEntries: LocalLogEntry[], goal: GoalRow | null, choices: Record<string, DayChoice>) {
  const byDate = new Map<string, LocalLogEntry[]>();
  for (const e of weekEntries) byDate.set(e.local_date, [...(byDate.get(e.local_date) ?? []), e]);
  return weeklyAverage(
    {
      today: date,
      targets: targetsOf(goal),
      choices,
      days: [...byDate].map(([local_date, day]) => ({ local_date, items: day.map((e) => Object.fromEntries(NUTRIENTS.map((n) => [n, e[`${n}_total`]]))) })),
    },
    NUTRIENTS,
  );
}

function DayList({
  date,
  now,
  days,
  listed,
  goals,
  week,
}: {
  date: string;
  now: string;
  days: string[];
  listed: LocalLogEntry[] | undefined;
  goals: (GoalRow | null)[] | undefined;
  week: WeeklyMeasure | null;
}) {
  const forward = canPageForward(date, now);
  const yesterday = addDays(now, -1);
  const chevron = 'flex h-11 w-11 items-center justify-center rounded-full';
  return (
    <section aria-label="Days" className="card p-4">
      <div className="flex items-center justify-between px-1.5 pb-3 pt-1">
        <span className="text-[15px] font-bold">{monthLabel(days[0])}</span>
        <span className="-my-3 -mr-1.5 flex text-secondary">
          <a href={href('diary', pageDay(date, now, -1))} aria-label="Earlier week" className={`tap ${chevron} hover:bg-raised hover:text-text`}>
            <Icon name="back" size={18} />
          </a>
          {forward ? (
            <a href={href('diary', pageDay(date, now, 1))} aria-label="Later week" className={`tap ${chevron} hover:bg-raised hover:text-text`}>
              <Icon name="next" size={18} />
            </a>
          ) : (
            <span aria-hidden="true" className={`${chevron} text-strong`}>
              <Icon name="next" size={18} />
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        {days.map((d, i) => {
          const selected = d === date;
          const summary = listed ? dayRowSummary(listed.filter((e) => e.local_date === d), goals?.[i]?.kcal_target ?? null) : null;
          const kcal = summary ? formatTotal(summary.kcal, 0) : null;
          const logged = summary !== null && summary.kcal.count > 0;
          const bar = summary?.over ? 'bg-accent-2' : selected || d >= yesterday ? 'bg-accent' : 'bg-strong';
          return (
            <a
              key={d}
              href={href('diary', d)}
              aria-current={selected ? 'date' : undefined}
              data-testid="diary-day"
              className={`tap flex items-center gap-3.5 rounded-[14px] border px-3.5 py-3 ${
                selected ? 'border-accent bg-raised' : `border-transparent hover:bg-raised/60 ${d < yesterday ? 'opacity-70 hover:opacity-100' : ''}`
              }`}
            >
              <div className="w-11">
                <div className="text-[11px] text-secondary">{weekday(d)}</div>
                <div className="text-[20px] font-bold">{dayOfMonth(d)}</div>
              </div>
              <div className="min-w-0 grow">
                {/* A fixed line height, so a row is as tall before its numbers are read as after. */}
                <div className="flex h-[17px] items-center justify-between gap-1 whitespace-nowrap text-[13px]">
                  {logged && kcal ? <span className="num font-semibold">{withUnknown(kcal)} kcal</span> : <span className="text-secondary">{summary ? 'Not logged' : ''}</span>}
                  <span className="text-secondary">{d === now ? 'Today' : summary?.over ? 'over' : ''}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-[3px] bg-border">
                  <div className={`h-1.5 rounded-[3px] ${bar}`} style={{ width: `${summary?.pct ?? 0}%` }} />
                </div>
              </div>
            </a>
          );
        })}
      </div>

      <div className="mt-3.5 rounded-[14px] bg-raised p-3.5" title="Average per logged day, from Monday up to the day before the one picked">
        <div className="text-[12px] text-secondary">Week average</div>
        <div className="num mt-0.5 text-[20px] font-bold" data-testid="diary-week-average">
          {week && week.average !== null && week.covered < week.count ? '≥ ' : ''}
          {formatNumber(week?.average ?? null, 0)} <span className="text-[12px] font-medium text-secondary">kcal</span>
        </div>
      </div>
    </section>
  );
}

function DayCard({
  date,
  now,
  entries,
  goal,
  canRepeat,
  repeating,
  onRepeat,
  skipped,
  onTrack,
}: {
  date: string;
  now: string;
  entries: LocalLogEntry[];
  goal: GoalRow | null;
  canRepeat: boolean;
  repeating: boolean;
  onRepeat: () => void;
  /** Decision 47: why this logged day is left out of averages, null when it counts, undefined when nothing is logged. */
  skipped: 'auto' | 'user' | null | undefined;
  onTrack: (choice: DayChoice) => void;
}) {
  const totals = totalsOf(entries);
  const kcal = formatTotal(totals.kcal, 0);
  const targets = targetsOf(goal);
  const left = remainingToday(totals, targets, ['kcal']).kcal;
  const leftText = remainingText(left, 'kcal');
  // An empty earlier day has nothing to compare, so only the target shows.
  const showLeft = left.left !== null && (entries.length > 0 || date === now);
  const mealTotals = MEALS.map((meal) => ({ meal, total: totalsOf(entries.filter((e) => e.meal === meal)).kcal }));
  const barWhole = Math.max(goal?.kcal_target ?? 0, totals.kcal.value ?? 0, 1);

  return (
    <div className="card px-6 py-[22px]">
      {/* Always 44 px tall, so the buttons appearing never push the card down. */}
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="min-w-0 text-[13px] text-secondary">{longDayLabel(date)}</div>
        <div className="flex gap-2">
          {canRepeat && (
            <button
              type="button"
              disabled={repeating}
              onClick={onRepeat}
              className="tap flex h-11 items-center whitespace-nowrap rounded-full border border-border bg-raised px-4 text-[14px] font-semibold disabled:text-secondary"
            >
              Repeat yesterday
            </button>
          )}
          {skipped !== undefined && (
            // Decision 47: one button to count this day in averages or leave it out. The label says what a click does.
            <button
              type="button"
              disabled={repeating}
              onClick={() => onTrack(skipped === null ? 'skip' : 'count')}
              title={
                skipped === 'auto'
                  ? 'Under half the calorie target, so it looks partly logged and is left out of averages. Track counts it.'
                  : skipped === 'user'
                    ? 'You left this day out of averages. Track counts it again.'
                    : 'This day counts in averages. Untrack leaves it out, for a day you did not log fully.'
              }
              data-testid="day-track"
              className={`tap flex h-11 w-[104px] items-center justify-center whitespace-nowrap rounded-full px-4 text-[14px] font-semibold disabled:text-secondary ${
                skipped === null ? 'border border-border bg-raised' : 'bg-accent-tint text-accent-2'
              }`}
            >
              {skipped === null ? 'Untrack' : 'Track'}
            </button>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-2 whitespace-nowrap">
        <span className="num text-[40px] font-bold tracking-[-1.2px]" data-testid="kcal-eaten">
          {kcal.text}
        </span>
        <span className="text-[15px] text-secondary">{goal ? <span className="num">/ {formatNumber(goal.kcal_target, 0)} kcal</span> : 'kcal'}</span>
        {goal && showLeft && (
          <span className={`num ml-2 flex h-7 items-center self-center rounded-full px-3 text-[14px] font-bold ${leftText.over ? 'bg-[#2A1308] text-accent-2' : 'bg-raised text-text'}`} data-testid="kcal-left">
            {leftText.value} {leftText.over ? 'over' : 'left'}
          </span>
        )}
        <span className="self-center">
          <UnknownChip count={kcal.unknown} what="calorie value" />
        </span>
      </div>

      <div className="mt-4 flex h-2.5 gap-[3px] overflow-hidden rounded-[5px] bg-border">
        {mealTotals.map(({ meal, total }) => (
          <div key={meal} className="h-2.5" style={{ width: `${((total.value ?? 0) / barWhole) * 100}%`, background: MEAL_COLORS[meal] }} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2.5">
        {mealTotals.map(({ meal, total }) => (
          <div key={meal} className="flex min-w-0 items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: MEAL_COLORS[meal] }} />
            <span className="num truncate whitespace-nowrap text-[12px] text-secondary">
              {MEAL_LABEL[meal]} {withUnknown(formatTotal(total, 0))}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-[18px] grid grid-cols-4 gap-2.5">
        {MACRO_TILES.map((m) => {
          const t = totals[m.key];
          const shown = formatTotal(t, 1);
          const target = goal ? goal[m.target] : null;
          const pct = target && t.value !== null ? Math.min(100, (t.value / target) * 100) : 0;
          return (
            <div key={m.key} className="rounded-[14px] bg-raised px-3.5 py-3" data-testid={`macro-${m.key}`}>
              <div className="text-[12px] text-secondary">{m.label}</div>
              <div className="num mt-[3px] whitespace-nowrap text-[20px] font-bold">
                {shown.text} g{shown.unknown > 0 && <span className="text-[12px] font-medium text-secondary" title={`${shown.unknown} without a value`}> +?</span>}
                {target !== null && <span className="text-[12px] font-medium text-secondary"> / {formatNumber(target, 0)}</span>}
              </div>
              <div className="mt-2 h-1 rounded-sm bg-border">
                <div className="h-1 rounded-sm" style={{ width: `${pct}%`, background: m.color }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MealTable({
  date,
  now,
  entries,
  stored,
  editing,
  valid,
  busy,
  onPick,
  onChange,
  onCancel,
  onDone,
  onDelete,
}: {
  date: string;
  now: string;
  entries: LocalLogEntry[];
  stored: LocalLogEntry[];
  editing: EditState | null;
  valid: boolean;
  busy: boolean;
  onPick: (entry: LocalLogEntry) => void;
  onChange: (next: EditState) => void;
  onCancel: () => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const number = 'num text-right';
  return (
    <div className="card overflow-hidden">
      <div className={`${TABLE_COLUMNS} px-5 pb-2.5 pt-4 text-[11px] text-secondary`}>
        <span>Food</span>
        <span className="text-right">kcal</span>
        <span className="text-right">Carbs</span>
        <span className="text-right">Fat</span>
        <span className="text-right">Protein</span>
      </div>

      {entries.length === 0 && (
        <div className="border-t border-border px-5 py-8 text-center">
          <a href={date === now ? href('add') : withDay(href('add'), date)} className="tap inline-flex h-11 items-center gap-2 rounded-full bg-accent px-[18px] text-[14px] font-bold text-ground">
            <Icon name="plus" size={18} stroke={2.4} />
            Log food
          </a>
        </div>
      )}

      {DIARY_GROUPS.map((meal) => {
        const rows = entries.filter((e) => e.meal === meal);
        if (rows.length === 0) return null;
        return (
          <div key={meal} role="group" aria-label={GROUP_LABEL[meal]}>
            <div className={`${TABLE_COLUMNS} items-center border-t border-border bg-raised px-5 py-2.5`}>
              <span className="flex items-center gap-2 text-[13px] font-bold text-soft">
                {GROUP_LABEL[meal]}
                {meal === 'supplements' && <HomeIcon name="daily" size={14} className="text-secondary" label="Added every day" />}
              </span>
              <span className="num text-right text-[13px] font-bold">{withUnknown(formatTotal(totalsOf(rows).kcal, 0))}</span>
            </div>
            {rows.map((e) => {
              const isOpen = editing?.id === e.id;
              return (
                <div key={e.id}>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    onClick={() => {
                      // A daily supplement has its own edit screen (amount from today on, skip, stop).
                      if (e.daily_supplement_id !== null) return navigate(href('entry', e.id));
                      const original = stored.find((s) => s.id === e.id);
                      if (original) onPick(original);
                    }}
                    className={`${TABLE_COLUMNS} w-full items-center border-t border-border px-5 py-[11px] text-left text-[14px] ${
                      isOpen ? 'bg-raised-2 shadow-[inset_3px_0_0_var(--color-accent)]' : 'hover:bg-raised/60'
                    }`}
                    data-testid="diary-entry"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{e.name}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-secondary">
                        {amountLabel(e)}
                        {e.server_seq === null && <HomeIcon name="notSynced" size={13} label="Not synced" />}
                      </span>
                    </span>
                    <span className={`${number} font-semibold`}>{formatNumber(e.kcal_total, 0)}</span>
                    <span className={`${number} text-secondary`}>{formatNumber(e.carbs_g_total, 1)}</span>
                    <span className={`${number} text-secondary`}>{formatNumber(e.fat_g_total, 1)}</span>
                    <span className={`${number} text-secondary`}>{formatNumber(e.protein_g_total, 1)}</span>
                  </button>
                  {isOpen && editing && <EditRow entry={e} editing={editing} valid={valid} busy={busy} onChange={onChange} onCancel={onCancel} onDone={onDone} onDelete={onDelete} />}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function EditRow({
  entry,
  editing,
  valid,
  busy,
  onChange,
  onCancel,
  onDone,
  onDelete,
}: {
  entry: LocalLogEntry;
  editing: EditState;
  valid: boolean;
  busy: boolean;
  onChange: (next: EditState) => void;
  onCancel: () => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const step = (direction: -1 | 1) => onChange({ ...editing, quantity: String(steppedAmount(parsedQuantity(editing.quantity) ?? entry.quantity, entry.unit, direction)) });
  const stepButton = 'tap flex h-11 w-11 items-center justify-center rounded-full bg-border';
  return (
    <div className="flex flex-wrap items-center gap-3.5 border-t border-border bg-raised-2 px-5 pb-[18px] pt-3.5 shadow-[inset_3px_0_0_var(--color-accent)]" data-testid="diary-edit">
      {/* Accuracy rule 4: the snapshot's source and whether it is verified. */}
      <div className="flex basis-full flex-wrap items-center gap-x-2 text-[12px] text-secondary">
        {entry.brand && <span>{entry.brand}</span>}
        <SourceBadge sourceName={entry.source === 'custom' ? 'Your own food' : entry.source} verified={entry.verified === null ? null : entry.verified === 1} detail />
      </div>

      <button type="button" aria-label="Delete entry" disabled={busy} onClick={onDelete} className="tap flex h-11 w-11 items-center justify-center rounded-full border-[1.5px] border-[#7A2A2E] bg-[#2A1517] text-[#FF6B6B]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
        </svg>
      </button>

      <div className="flex items-center gap-1.5 rounded-[26px] bg-raised p-[5px]">
        <button type="button" aria-label="Less" onClick={() => step(-1)} className={stepButton}>
          <Icon name="minus" size={18} stroke={2.4} />
        </button>
        <div className="flex min-w-[78px] items-baseline justify-center gap-1 text-[20px] font-bold">
          <input
            aria-label={`Amount in ${entry.unit}`}
            inputMode="decimal"
            value={editing.quantity}
            onChange={(e) => onChange({ ...editing, quantity: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) onDone();
              if (e.key === 'Escape') onCancel();
            }}
            style={{ width: `${Math.max(2, editing.quantity.length)}ch` }}
            className="num min-w-0 bg-transparent text-right outline-none"
          />
          <span>{entry.unit}</span>
        </div>
        <button type="button" aria-label="More" onClick={() => step(1)} className={stepButton}>
          <Icon name="plus" size={18} stroke={2.4} />
        </button>
      </div>

      <div className="flex gap-1.5">
        {MEALS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={editing.meal === m}
            onClick={() => onChange({ ...editing, meal: m })}
            className={`tap flex h-11 items-center rounded-full px-3.5 text-[13px] ${editing.meal === m ? 'bg-text font-bold text-ground' : 'border border-border bg-raised text-soft'}`}
          >
            {MEAL_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="ml-auto flex gap-2">
        <button type="button" onClick={onCancel} className="tap flex h-11 items-center rounded-full bg-border px-[18px] text-[14px] font-semibold">
          Cancel
        </button>
        <button type="button" disabled={busy || !valid} onClick={onDone} className="tap flex h-11 items-center rounded-full bg-accent px-5 text-[14px] font-bold text-ground disabled:bg-border disabled:text-faint">
          Done
        </button>
      </div>
    </div>
  );
}

const GOOD_PILL = 'bg-[#16261b] text-[#7FD99A]';
const BAD_PILL = 'bg-[#2A1308] text-accent-2';

function isGoodVerdict(verdict: Verdict, key: Nutrient): boolean {
  // More protein or fibre than the target is not a problem, unlike calories, carbs or fat.
  return verdict === 'on_target' || (verdict === 'above_target' && (key === 'protein_g' || key === 'fibre_g'));
}

function WeeklyPanel({ date, now, entries, weekEntries, goal, choices }: {
  date: string; now: string; entries: LocalLogEntry[]; weekEntries: LocalLogEntry[]; goal: GoalRow | null;
  choices: Record<string, DayChoice>;
}) {
  const [prefs, setPrefs] = usePrefs();
  const [menu, setMenu] = useState<'menu' | 'cfg' | null>(null);

  const enabled = MEASURES.filter((m) => prefs.enabled.includes(m.key));
  const current = enabled.find((m) => m.key === prefs.measure) ?? enabled[0] ?? MEASURES[1];
  const key = current.key;
  const unit = unitOf(key);

  const week = weekOf(date, weekEntries, goal, choices);
  const m = week.measures[key];
  const target = targetsOf(goal)[key] ?? null;
  const dayValue = totalsOf(entries)[key].value;
  const values = [...m.days.map((d) => d.value), dayValue].filter((v): v is number => v !== null);
  const top = Math.max(target !== null ? target * 1.25 : 0, ...values.map((v) => v * 1.05), 1);
  const heightOf = (v: number | null) => `${v === null ? 0 : (v / top) * 100}%`;
  const bars = [
    ...m.days.map((d) => ({ date: d.local_date, value: d.value, picked: false, day: d as WeeklyDay | null })),
    { date, value: dayValue, picked: true, day: null as WeeklyDay | null },
  ];

  const before = date === now ? 'today' : 'this day';
  const lowerBound = m.average !== null && m.covered < m.count;
  // Hover only: the headline, its chips and the bars say this on screen.
  const caption = m.average === null ? `${current.label}: no values logged before ${before}` : `${current.label}, ${lowerBound ? 'at least, per logged day' : 'average per logged day'} before ${before}`;
  const sources = topSources(entries, key);
  const inRing = key === 'kcal' || key === 'protein_g' || key === 'carbs_g' || key === 'fat_g';

  return (
    <aside className="card relative col-start-2 p-5 min-[1360px]:col-start-3" aria-label="Weekly average">
      <div className="flex items-baseline justify-between">
        <span className="text-[17px] font-bold">Weekly average</span>
        <span className="text-[12px] text-secondary">{weekRange(week.dates)}</span>
      </div>

      <div className="mt-3.5 flex gap-2">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={menu === 'menu'}
          onClick={() => setMenu(menu === 'menu' ? null : 'menu')}
          className="flex h-11 min-w-0 flex-1 items-center justify-between rounded-[14px] border border-border bg-raised px-3.5 text-[14px] font-semibold"
        >
          {current.label}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-secondary">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Choose which nutrients to show"
          aria-expanded={menu === 'cfg'}
          onClick={() => setMenu(menu === 'cfg' ? null : 'cfg')}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-border text-soft ${menu === 'cfg' ? 'bg-border' : 'bg-raised'}`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </button>
      </div>

      {menu !== null && <div className="fixed inset-0 z-[4]" onClick={() => setMenu(null)} />}

      {menu === 'menu' && (
        <div role="listbox" aria-label="Nutrient" className="desktop-scroll absolute inset-x-5 top-28 z-[5] max-h-[340px] overflow-auto rounded-[14px] border border-strong bg-raised-2 p-1.5 shadow-[0_14px_34px_rgba(0,0,0,0.55)]">
          {enabled.map((o) => (
            <button
              key={o.key}
              type="button"
              role="option"
              aria-selected={o.key === key}
              onClick={() => {
                setPrefs({ ...prefs, measure: o.key });
                setMenu(null);
              }}
              className={`flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-[14px] ${o.key === key ? 'bg-border font-bold' : ''}`}
            >
              <span>{o.label}</span>
              {o.key === key && <Icon name="check" size={16} stroke={2.6} className="text-accent" />}
            </button>
          ))}
        </div>
      )}

      {menu === 'cfg' && (
        <div className="desktop-scroll absolute inset-x-3 top-28 z-[6] max-h-[560px] overflow-auto rounded-2xl border border-strong bg-raised-2 p-4 shadow-[0_14px_34px_rgba(0,0,0,0.55)]">
          <div className="flex items-center justify-between">
            <span className="text-[15px] font-bold">Show in the list</span>
            <button type="button" onClick={() => setMenu(null)} className="-my-3 -mr-2 h-11 px-2 text-[13px] font-bold text-accent-2">
              Done
            </button>
          </div>
          {MEASURE_GROUPS.map((group) => (
            <div key={group}>
              <div className="mt-3.5 pb-1 text-[11px] text-secondary">{group}</div>
              {MEASURES.filter((o) => o.group === group).map((o) => {
                const on = prefs.enabled.includes(o.key);
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => {
                      const next = on ? prefs.enabled.filter((k) => k !== o.key) : [...prefs.enabled, o.key];
                      if (next.length > 0) setPrefs({ ...prefs, enabled: next });
                    }}
                    className="flex w-full items-center justify-between border-t border-border py-[9px] text-left text-[14px]"
                  >
                    <span>{o.label}</span>
                    <span className={`flex h-[22px] w-[22px] items-center justify-center rounded-[7px] ${on ? 'bg-accent text-ground' : 'border-[1.5px] border-strong'}`}>
                      {on && <Icon name="check" size={13} stroke={3.2} />}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className="mt-4">
        <MacroRing week={week} targets={{ kcal: targetsOf(goal).kcal ?? undefined, protein_g: targetsOf(goal).protein_g ?? undefined, carbs_g: targetsOf(goal).carbs_g ?? undefined, fat_g: targetsOf(goal).fat_g ?? undefined }} />
      </div>

      {/* The average per logged day before the picked one. "≥" when some entries have no value (rule 2).
          Calories and the macros are in the ring above, so the big number shows only for the other nutrients. */}
      {!inRing && (<>
      <div className="mt-5 flex items-baseline gap-2 whitespace-nowrap" title={caption}>
        <span className="num text-[38px] font-bold tracking-[-1px]" data-testid="weekly-average">
          {lowerBound ? '≥ ' : ''}
          {amountText(m.average, key)} {unit}
        </span>
        {target !== null && <span className="num text-[13px] text-secondary">/ {amountText(target, key)}</span>}
      </div>
      {target !== null && target > 0 && (
        <div
          className="mt-2 h-1.5 rounded-[3px] bg-border"
          role="img"
          aria-label={m.average === null ? 'Target progress unknown' : `${formatNumber((m.average / target) * 100, 0)}% of target`}
          data-testid="weekly-progress"
        >
          {m.average !== null && <div className="h-1.5 rounded-[3px] bg-accent" style={{ width: `${Math.min(100, (m.average / target) * 100)}%` }} />}
        </div>
      )}
      </>)}
      <div className="mt-3 flex min-h-6 flex-wrap items-center gap-2" data-testid="weekly-coverage">
        {m.verdict && (
          <span className={`flex h-6 items-center rounded-xl px-2.5 text-[12px] font-semibold ${isGoodVerdict(m.verdict, key) ? GOOD_PILL : BAD_PILL}`} data-testid="weekly-verdict">
            {VERDICT_LABEL[m.verdict]}
          </span>
        )}
        {week.dates.length > 0 && (
          <CountChip icon="calendar" label={daysLabel(week)} testId="weekly-days">
            {ofText(week.counted_days, week.dates.length)}
          </CountChip>
        )}
        <UnknownChip count={m.count - m.covered} what={`${current.label.toLowerCase()} value`} testId="weekly-unknown" />
      </div>

      <div className="relative mt-3.5 h-[120px]" role="img" aria-label={bars.map((b) => `${weekday(b.date)} ${amountText(b.value, key)} ${unit}`).join(', ')}>
        {target !== null && <div className="absolute inset-x-0 border-t border-dashed border-faint" style={{ bottom: heightOf(target) }} />}
        <div className="absolute inset-0 flex items-end gap-2">
          {bars.map((b) => {
            const skipped = b.day !== null && !b.day.counted;
            const bar =
              b.value === null ? (
                // No value: a dashed stub, so it reads as left out rather than 0 (rule 2).
                <div className="h-[3px] w-full border-t border-dashed border-faint" />
              ) : (
                // Decision 47: a left-out day keeps its bar, striped. Track / Untrack is on the day card.
                <div
                  className={`w-full rounded-[5px_5px_2px_2px] ${b.picked ? 'bg-accent' : skipped ? '' : 'bg-strong'}`}
                  style={{ height: heightOf(b.value), ...(skipped ? SKIPPED_BAR : {}) }}
                />
              );
            const title = b.day !== null && b.day.logged ? dayStatusLabel(b.day, `${amountText(b.value, key)} ${unit}`) : undefined;
            return (
              <div key={b.date} title={title} data-testid={`week-day-${b.date}`} data-counted={b.day?.counted ?? undefined} className="flex h-full min-w-0 flex-1 items-end">
                {bar}
              </div>
            );
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-2">
        {bars.map((b) => (
          <span key={b.date} className={`min-w-0 flex-1 text-center text-[11px] ${b.day !== null && !b.day.counted ? 'text-faint' : 'text-secondary'}`}>
            {weekday(b.date)}
          </span>
        ))}
      </div>

      <div className="mt-[22px] border-t border-border pt-4">
        <div className="text-[14px] font-bold">Top sources</div>
        {sources.length === 0 ? (
          <p className="num mt-2 text-[20px] font-bold text-secondary" title={`No known ${current.label.toLowerCase()} values for ${before}`}>
            ?
          </p>
        ) : (
          <div className="mt-3.5 flex flex-col gap-3">
            {sources.map((s) => (
              <div key={s.id} data-testid="top-source">
                <div className="flex justify-between gap-2 text-[13px]">
                  <span className="min-w-0 truncate font-semibold">{s.name}</span>
                  <span className="num shrink-0 text-secondary">
                    {amountText(s.value, key)} {unit}
                  </span>
                </div>
                <div className="mt-[7px] h-[5px] rounded-[3px] bg-border">
                  <div className="h-[5px] rounded-[3px] bg-accent" style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
