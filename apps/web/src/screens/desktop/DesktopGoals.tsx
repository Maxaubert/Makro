// D_Goals: the goal type, target weight and pace, about you, and the targets with their macro split,
// edited on one page. Same form, limits and save as the phone screens (screens/goalFields.tsx,
// domain/goalForm.ts); every number is calculated there or typed by the user.
import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { formatNumber } from '../../domain/format';
import { buildGoalChange, prefillGoalForm, toNumber, type GoalForm, type Prefill, type TargetKey } from '../../domain/goalForm';
import { macroSplit, type GoalType, type Sex } from '../../domain/goals';
import type { StoredGoal } from '../../domain/entry';
import { browserTimeZone } from '../../domain/localDate';
import { useApp, useData } from '../../lib/hooks';
import { DesktopShell } from '../../ui/desktop';
import { Notice } from '../../ui/kit';
import { ACTIVITY, GOAL_TYPES, GoalNotes, Under18Note, pickGoalType, useGoalForm } from '../goalFields';

const GOAL_SUB: Record<GoalType, string> = {
  lose: 'Eat a little less than you burn',
  maintain: 'Stay where you are',
  gain: 'Eat a little more than you burn',
};

const CARD = 'rounded-[20px] border border-border bg-card';
const TILE = 'block rounded-[14px] bg-raised px-3.5 py-3 focus-within:outline-1 focus-within:outline-accent-2';
const TILE_LABEL = 'block text-[12px] text-secondary';
const MACRO_GRID = 'grid grid-cols-[minmax(0,1fr)_64px_64px_56px] gap-2 xl:grid-cols-[minmax(0,1fr)_90px_90px_90px]';

/** A number field as wide as its text, so a unit can sit right after it as on the board. */
function FitInput({ label, value, onChange, className, placeholder = '?', onFocus, onBlur, inputRef }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className: string;
  placeholder?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  inputRef?: RefObject<HTMLInputElement>;
}) {
  return (
    <span className="inline-grid min-w-0 max-w-full">
      <span aria-hidden="true" className={`num invisible col-start-1 row-start-1 whitespace-pre pr-px ${className}`}>{value || placeholder}</span>
      <input
        ref={inputRef}
        size={1}
        inputMode="decimal"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        className={`num col-start-1 row-start-1 w-full min-w-0 bg-transparent pr-px outline-none placeholder:text-secondary ${className}`}
      />
    </span>
  );
}

function TileSelect<T extends string>({ label, value, options, onChange }: { label: string; value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <label className={TILE}>
      <span className={TILE_LABEL}>{label}</span>
      <select
        aria-label={label}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value as T)}
        className="mt-0.5 block w-full cursor-pointer appearance-none bg-transparent text-[18px] font-bold outline-none"
      >
        {value === null && <option value="" hidden>?</option>}
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function AboutTile({ label, unit, value, onChange }: { label: string; unit?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className={TILE}>
      <span className={TILE_LABEL}>{label}</span>
      <span className="mt-0.5 flex flex-wrap items-baseline text-[18px] font-bold">
        <FitInput label={label} value={value} onChange={onChange} className="text-[18px] font-bold" />
        {unit && <span className="whitespace-pre"> {unit}</span>}
      </span>
    </label>
  );
}

function PlanValue({ unit, children }: { unit: string; children: ReactNode }) {
  return (
    <span className="mt-0.5 flex flex-wrap items-baseline text-[22px] font-bold">
      {children}
      <span className="ml-1.5 text-[12px] font-medium text-secondary">{unit}</span>
    </span>
  );
}

function PlanTiles({ form, set }: { form: GoalForm; set: (patch: Partial<GoalForm>) => void }) {
  const input = 'text-[22px] font-bold';
  // Maintain has no target or pace of its own: you stay at your weight, and nothing extra is saved.
  if (form.goalType === 'maintain') {
    return (
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-[14px] bg-raised px-3.5 py-3"><span className={TILE_LABEL}>Target weight</span><PlanValue unit="kg"><span className="num">{form.weight.trim() || '?'}</span></PlanValue></div>
        <div className="rounded-[14px] bg-raised px-3.5 py-3"><span className={TILE_LABEL}>Pace</span><PlanValue unit="kg / week"><span className="num">0.0</span></PlanValue></div>
      </div>
    );
  }
  return (
    <div className="mt-4 grid grid-cols-2 gap-2.5">
      <label className={TILE}>
        <span className={TILE_LABEL}>Target weight</span>
        <PlanValue unit={form.targetWeight.trim() === '' ? 'kg, optional' : 'kg'}>
          <FitInput label="Target weight" placeholder="–" value={form.targetWeight} onChange={(targetWeight) => set({ targetWeight })} className={input} />
        </PlanValue>
      </label>
      <label className={TILE}>
        <span className={TILE_LABEL}>Pace</span>
        <PlanValue unit="kg / week">
          <FitInput label="Pace" value={form.pace} onChange={(pace) => set({ pace, edits: {} })} className={input} />
        </PlanValue>
      </label>
    </div>
  );
}

/** Typed text as a number the split can use; anything else is unknown, not 0. */
const gramsOf = (text: string): number | null => {
  const n = toNumber(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

/** The big number, with thousands separators while it is not being typed in. */
function KcalField({ text, onChange }: { text: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  // Dropping the thousands separator on focus rewrites the text and loses the selection a Tab or click
  // just made, so typing would append to the old number. Select it all again in the same commit.
  useLayoutEffect(() => {
    if (focused) ref.current?.select();
  }, [focused]);
  const n = toNumber(text);
  const shown = !focused && Number.isInteger(n) ? formatNumber(n, 0) : text;
  return (
    <label className="mt-1 block text-[84px] font-bold leading-[1.05] tracking-[-3px]">
      <FitInput
        label="Daily calories"
        inputRef={ref}
        value={shown}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="text-[84px] font-bold leading-[1.05] tracking-[-3px]"
      />
      <span className="text-[24px] font-medium tracking-normal text-secondary"> kcal</span>
    </label>
  );
}

function GramsField({ name, text, onChange }: { name: string; text: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-baseline justify-end font-bold">
      <FitInput label={name} value={text} onChange={onChange} className="text-right text-[15px] font-bold" />
      <span className="whitespace-pre"> g</span>
    </label>
  );
}

function Editor({ initial, justSaved, onSaved }: { initial: Prefill; justSaved: boolean; onSaved: (goal: StoredGoal | null) => void }) {
  const app = useApp();
  const state = useGoalForm(initial);
  const { form, evaluation: e, prefill } = state;
  const [saved, setSaved] = useState(justSaved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (patch: Partial<GoalForm>) => {
    state.set(patch);
    setSaved(false);
  };
  const edit = (key: TargetKey) => (v: string) => set({ edits: { ...form.edits, [key]: v } });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      if (e.unchanged) {
        setSaved(true);
      } else {
        const { goal, weight } = buildGoalChange(form, prefill.baseline, new Date(), browserTimeZone());
        await app.db.saveGoalChange(goal, weight);
        await app.changed();
        // The form starts over from the row just written, so the next save compares against it.
        onSaved(await app.db.latestGoal());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const split = macroSplit({ protein_g: gramsOf(e.shown.protein), carbs_g: gramsOf(e.shown.carbs), fat_g: gramsOf(e.shown.fat) });
  const macros = [
    { key: 'protein', name: 'Protein', color: 'bg-accent', part: split.protein },
    { key: 'carbs', name: 'Carbs', color: 'bg-accent-2', part: split.carbs },
    { key: 'fat', name: 'Fat', color: 'bg-accent-3', part: split.fat },
  ] as const;
  const segments = macros.filter((m) => (m.part.share ?? 0) > 0);

  return (
    <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-5">
      <section className="flex flex-col gap-5">
        <div className={`${CARD} p-6`}>
          <div className="text-[17px] font-bold">Goal</div>
          <div className="mt-4 flex flex-col gap-2.5">
            {GOAL_TYPES.map((g) => {
              const on = form.goalType === g.value;
              return (
                <button
                  key={g.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set(pickGoalType(g))}
                  className={`tap flex items-center gap-3.5 rounded-2xl bg-raised p-4 text-left ${on ? 'border-[1.5px] border-accent' : 'border border-border'}`}
                >
                  <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2 ${on ? 'border-accent' : 'border-[#3A3A3E]'}`}>
                    {on && <span className="h-2.5 w-2.5 rounded-full bg-accent" />}
                  </span>
                  <span className="grow">
                    <span className="block text-[16px] font-bold">{g.label}</span>
                    <span className="mt-0.5 block text-[13px] text-secondary">{GOAL_SUB[g.value]}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <PlanTiles form={form} set={set} />
        </div>

        <div className={`${CARD} p-6`}>
          <div className="flex items-center justify-between">
            <span className="text-[17px] font-bold">About you</span>
            <span className="text-[13px] font-semibold text-accent-2">Used for the calculation</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <TileSelect<Sex> label="Sex" value={form.sex} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }]} onChange={(sex) => set({ sex })} />
            <AboutTile label="Age" value={form.age} onChange={(age) => set({ age })} />
            <AboutTile label="Height" unit="cm" value={form.height} onChange={(height) => set({ height })} />
            <AboutTile label="Weight" unit="kg" value={form.weight} onChange={(weight) => set({ weight })} />
          </div>
          <div className="mt-2.5">
            <TileSelect label="Activity" value={form.activity} options={ACTIVITY} onChange={(activity) => set({ activity })} />
          </div>
          <Under18Note state={state} />
        </div>
      </section>

      <section className={`${CARD} p-7`}>
        <div className="text-[13px] text-secondary">Daily calories</div>
        <KcalField text={e.shown.kcal} onChange={edit('kcal')} />
        <div className="mt-[22px] flex h-3.5 gap-[3px] overflow-hidden rounded-[7px]" data-testid="macro-split">
          {segments.length === 0 ? (
            <div className="h-3.5 w-full bg-border" />
          ) : (
            segments.map((m) => <div key={m.key} className={`h-3.5 ${m.color}`} style={{ width: `${m.part.share}%` }} />)
          )}
        </div>
        <div className="mt-[22px] border-t border-border">
          <div className={`${MACRO_GRID} pb-2 pt-3 text-[11px] text-secondary`}>
            <span>Macro</span>
            <span className="text-right">Grams</span>
            <span className="text-right">kcal</span>
            <span className="text-right">Share</span>
          </div>
          {macros.map((m) => (
            <div key={m.key} className={`${MACRO_GRID} items-center border-t border-border py-3.5 text-[15px]`}>
              <span className="flex items-center gap-2.5 font-semibold"><span className={`h-2.5 w-2.5 rounded-full ${m.color}`} />{m.name}</span>
              <GramsField name={m.name} text={e.shown[m.key]} onChange={edit(m.key)} />
              <span className="num text-right text-secondary">{formatNumber(m.part.kcal, 0)}</span>
              <span className="num text-right text-secondary">{m.part.share === null ? '?' : `${m.part.share}%`}</span>
            </div>
          ))}
          <div className={`${MACRO_GRID} items-center border-t border-border py-3.5 text-[15px]`}>
            <span className="flex items-center gap-2.5 font-semibold"><span className="h-2.5 w-2.5 rounded-full bg-muted" />Fibre</span>
            <GramsField name="Fibre" text={e.shown.fibre} onChange={edit('fibre')} />
            <span className="text-right text-secondary">n/a</span>
            <span />
          </div>
        </div>
        <button
          type="button"
          disabled={!e.canSave || busy}
          onClick={() => void save()}
          className={`tap mt-6 flex h-[54px] w-full items-center justify-center rounded-full text-[16px] font-bold disabled:bg-raised disabled:text-[#6A6A70] ${saved ? 'bg-border text-secondary' : 'bg-accent text-ground'}`}
        >
          {saved ? 'Saved' : 'Save goal'}
        </button>
        <GoalNotes state={state} error={error} />
      </section>
    </div>
  );
}

export function DesktopGoals() {
  const app = useApp();
  const { data: loaded, error } = useData(() => app.db.latestGoal(), []);
  const [saves, setSaves] = useState<{ goal: StoredGoal | null; count: number } | null>(null);
  const goal = saves ? saves.goal : loaded;
  return (
    <DesktopShell active="goals" subtitle="Calories and macros worked out from your profile" title="Goals">
      {error && !saves ? (
        <Notice tone="error">{error}</Notice>
      ) : goal === undefined ? (
        <div aria-busy="true" />
      ) : (
        <Editor
          key={saves?.count ?? 0}
          initial={prefillGoalForm(goal, new Date().getFullYear())}
          justSaved={saves !== null}
          onSaved={(g) => setSaves((s) => ({ goal: g, count: (s?.count ?? 0) + 1 }))}
        />
      )}
    </DesktopShell>
  );
}
