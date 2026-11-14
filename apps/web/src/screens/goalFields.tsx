// The About you and Your goals fields, shared by first-run setup and the editing screens
// (B_Onboarding and B_Goals on the canvas). The rules live in domain/goalForm.ts.
import { useMemo, useState } from 'react';
import { emptyGoalForm, evaluateGoalForm, profileChange, withLatestWeight, type EditKey, type GoalEvaluation, type GoalForm, type Prefill } from '../domain/goalForm';
import type { Db } from '../lib/db';
import { kcalFloor, GOAL_CONSTANTS, type ActivityLevel, type GoalType } from '../domain/goals';
import { Chip, Notice } from '../ui/kit';
import { Glyph, LevelBars } from '../ui/icons-weight-goals-profile';
import { MacroEditor, RepairedNote } from './macroEditor';

export const ACTIVITY: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Mostly sitting' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];
export const GOAL_TYPES: { value: GoalType; label: string; pace: number }[] = [
  { value: 'lose', label: 'Lose', pace: 0.5 },
  { value: 'maintain', label: 'Maintain', pace: 0 },
  { value: 'gain', label: 'Gain', pace: 0.25 },
];

/** Picking a goal type starts from its usual pace and drops targets typed by hand. */
export const pickGoalType = (g: (typeof GOAL_TYPES)[number]): Partial<GoalForm> => ({ goalType: g.value, pace: String(g.pace), edits: {}, shares: null });

/** A new pace recalculates the goal, so targets typed by hand are dropped. */
export const changePace = (pace: string): Partial<GoalForm> => ({ pace, edits: {}, shares: null });

/** Chips that share the row evenly and are tall enough to tap, as on the canvas. */
const FULL_CHIPS = 'flex gap-2 [&>button]:h-12 [&>button]:flex-1 [&>button]:justify-center [&>button]:text-[15px]';

export interface GoalFormState {
  form: GoalForm;
  set: (patch: Partial<GoalForm>) => void;
  evaluation: GoalEvaluation;
  prefill: Prefill;
}

/** The latest goal, with a weight logged since then (the form must not start from an old weight). */
export async function loadGoal(db: Db) {
  const [goal, weights] = await Promise.all([db.latestGoal(), db.weights(1)]);
  return withLatestWeight(goal, weights[0] ?? null);
}

const PROFILE_NOTE = {
  age: 'Age: whole years',
  height: 'Height: 100 to 250 cm',
  weight: 'Weight: 30 to 400 kg',
} as const;

/** Why Continue is disabled: a value outside the limits. Nothing while a field is still empty. */
export function ProfileNote({ state }: { state: GoalFormState }) {
  const { form, evaluation } = state;
  const issue = evaluation.profileIssue;
  if (issue === null || issue === 'under_18') return null;
  const text = { age: form.age, height: form.height, weight: form.weight }[issue];
  if (text.trim() === '') return null;
  return <div className="mt-3"><Notice>{PROFILE_NOTE[issue]}</Notice></div>;
}

const FIRST_RUN: Prefill = { form: emptyGoalForm(), baseline: null, complete: false };

/** Form state. The prefill is read once: a sync while editing does not overwrite what is typed. */
export function useGoalForm(initial: Prefill = FIRST_RUN): GoalFormState {
  const [prefill] = useState(initial);
  const [form, setForm] = useState(prefill.form);
  const evaluation = useMemo(() => evaluateGoalForm(form, prefill.baseline), [form, prefill]);
  return { form, set: (patch) => setForm((f) => ({ ...f, ...patch })), evaluation, prefill };
}

function NumberField({ label, unit, placeholder, value, onChange }: { label: string; unit?: string; placeholder?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-secondary">{label}{unit ? ` (${unit})` : ''}</span>
      <input className="field num" inputMode="decimal" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Where to get help if food or weight feels hard: ROS (eating disorder advice), by phone or web. */
export function HelpNote() {
  const link = 'tap flex h-11 items-center gap-1.5 rounded-full border border-border bg-raised px-3.5 text-[14px] font-semibold text-accent-2';
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Help with eating disorders">
      <span className="mr-1 flex items-center gap-2 text-[14px] font-semibold">
        <Glyph name="heart" size={18} className="text-accent-2" />
        ROS help
      </span>
      <a className={link} href="tel:+4794817818" aria-label="Call ROS, eating disorder advice, 948 17 818">
        <Glyph name="phone" size={15} />
        948 17 818
      </a>
      <a className={link} href="https://www.nettros.no" target="_blank" rel="noreferrer" aria-label="ROS website, nettros.no">
        <Glyph name="globe" size={15} />
        nettros.no
      </a>
    </div>
  );
}

/** Shown when the age typed is under 18, with where to get help. */
export function Under18Note({ state }: { state: GoalFormState }) {
  const { form, evaluation } = state;
  if (evaluation.profileIssue !== 'under_18' || form.age.trim() === '') return null;
  return (
    <div className="mt-3">
      <Notice>Makro is for ages 18 and up.</Notice>
      <div className="mt-2"><HelpNote /></div>
    </div>
  );
}

export function AboutFields({ state }: { state: GoalFormState }) {
  const { form } = state;
  const set = (patch: Partial<GoalForm>) => state.set(profileChange(form, patch));
  return (
    <>
      <div className={`mt-4 ${FULL_CHIPS}`}>
        <Chip selected={form.sex === 'male'} onClick={() => set({ sex: 'male' })}>Male</Chip>
        <Chip selected={form.sex === 'female'} onClick={() => set({ sex: 'female' })}>Female</Chip>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <NumberField label="Age" value={form.age} onChange={(age) => set({ age })} />
        <NumberField label="Height" unit="cm" value={form.height} onChange={(height) => set({ height })} />
        <NumberField label="Weight" unit="kg" value={form.weight} onChange={(weight) => set({ weight })} />
      </div>
      <Under18Note state={state} />
      <ProfileNote state={state} />
      <p className="mt-4 text-[13px] text-secondary">Activity</p>
      <div className="mt-2 flex flex-col gap-2">
        {ACTIVITY.map((a, i) => (
          <button
            key={a.value}
            type="button"
            aria-pressed={form.activity === a.value}
            onClick={() => set({ activity: a.value })}
            className={`flex items-center gap-3 rounded-2xl bg-card p-4 text-left text-[15px] font-semibold ${form.activity === a.value ? 'border-[1.5px] border-accent' : 'border border-border'}`}
          >
            <LevelBars level={(i + 1) as 1 | 2 | 3} className={form.activity === a.value ? 'text-accent' : 'text-secondary'} />
            {a.label}
          </button>
        ))}
      </div>
    </>
  );
}

/** Why a goal cannot be saved, a save error, and the "An estimate you can change" line. */
export function GoalNotes({ state, error }: { state: GoalFormState; error: string | null }) {
  const { form, evaluation: e } = state;
  const [showHelp, setShowHelp] = useState(false);
  return (
    <>
      {e.problem === 'below_floor' && form.sex && <div className="mt-3"><Notice>Minimum {kcalFloor(form.sex)} kcal a day</Notice></div>}
      {e.problem === 'pace_too_fast' && <div className="mt-3"><Notice>Maximum pace {GOAL_CONSTANTS.max_loss_kg_per_week} kg a week</Notice></div>}
      {e.floored && <div className="mt-3"><Notice>Set to the minimum</Notice></div>}
      {e.targetIssue === 'not_below' && <div className="mt-3"><Notice>Target must be below your weight now</Notice></div>}
      {e.targetIssue === 'not_above' && <div className="mt-3"><Notice>Target must be above your weight now</Notice></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <p className="mt-3 flex justify-center">
        <button type="button" aria-expanded={showHelp} className="tap flex h-11 items-center gap-1.5 px-3 text-[13px] font-semibold text-accent-2" onClick={() => setShowHelp(!showHelp)}>
          <Glyph name="heart" size={15} />
          Need help?
        </button>
      </p>
      {showHelp && <div className="mt-2"><HelpNote /></div>}
    </>
  );
}

export function GoalFields({ state, error }: { state: GoalFormState; error: string | null }) {
  const { form, set, evaluation: e } = state;
  const edit = (key: EditKey) => (v: string) => set({ edits: { ...form.edits, [key]: v } });
  return (
    <>
      <div className={`mt-4 ${FULL_CHIPS}`}>
        {GOAL_TYPES.map((g) => (
          <Chip key={g.value} selected={form.goalType === g.value} onClick={() => set(pickGoalType(g))}>
            {g.label}
          </Chip>
        ))}
      </div>
      {form.goalType !== 'maintain' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NumberField label="Target weight" unit="kg" placeholder="Optional" value={form.targetWeight} onChange={(targetWeight) => set({ targetWeight })} />
          <NumberField label="Pace" unit="kg / week" value={form.pace} onChange={(pace) => set(changePace(pace))} />
        </div>
      )}
      <div className="mt-3"><NumberField label="Daily calories" unit="kcal" value={e.shown.kcal} onChange={edit('kcal')} /></div>
      <RepairedNote evaluation={e} />
      <div className="mt-4 rounded-[20px] border border-border bg-card px-4 pb-3 pt-1">
        <MacroEditor evaluation={e} onShares={(shares) => set({ shares })} />
      </div>
      <div className="mt-2 w-1/2 pr-1"><NumberField label="Fibre" unit="g" value={e.shown.fibre} onChange={edit('fibre')} /></div>
      <GoalNotes state={state} error={error} />
    </>
  );
}
