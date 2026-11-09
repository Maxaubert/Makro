// The About you and Your goals fields, shared by first-run setup and the editing screens
// (B_Onboarding and B_Goals on the canvas). The rules live in domain/goalForm.ts.
import { useMemo, useState } from 'react';
import { emptyGoalForm, evaluateGoalForm, type GoalEvaluation, type GoalForm, type Prefill, type TargetKey } from '../domain/goalForm';
import { kcalFloor, GOAL_CONSTANTS, type ActivityLevel, type GoalType } from '../domain/goals';
import { Chip, Notice } from '../ui/kit';

const ACTIVITY: { value: ActivityLevel; label: string }[] = [
  { value: 'sedentary', label: 'Mostly sitting' },
  { value: 'active', label: 'Active' },
  { value: 'very_active', label: 'Very active' },
];
const GOAL_TYPES: { value: GoalType; label: string; pace: number }[] = [
  { value: 'lose', label: 'Lose', pace: 0.5 },
  { value: 'maintain', label: 'Maintain', pace: 0 },
  { value: 'gain', label: 'Gain', pace: 0.25 },
];

/** Chips that share the row evenly and are tall enough to tap, as on the canvas. */
const FULL_CHIPS = 'flex gap-2 [&>button]:h-12 [&>button]:flex-1 [&>button]:justify-center [&>button]:text-[15px]';

export interface GoalFormState {
  form: GoalForm;
  set: (patch: Partial<GoalForm>) => void;
  evaluation: GoalEvaluation;
  prefill: Prefill;
}

const FIRST_RUN: Prefill = { form: emptyGoalForm(), baseline: null, complete: false };

/** Form state. The prefill is read once: a sync while editing does not overwrite what is typed. */
export function useGoalForm(initial: Prefill = FIRST_RUN): GoalFormState {
  const [prefill] = useState(initial);
  const [form, setForm] = useState(prefill.form);
  const evaluation = useMemo(() => evaluateGoalForm(form, prefill.baseline), [form, prefill]);
  return { form, set: (patch) => setForm((f) => ({ ...f, ...patch })), evaluation, prefill };
}

function NumberField({ label, unit, value, onChange }: { label: string; unit?: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-secondary">{label}{unit ? ` (${unit})` : ''}</span>
      <input className="field num" inputMode="decimal" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function HelpNote() {
  return (
    <p className="text-[13px] leading-relaxed text-secondary">
      If food or weight feels hard, you can talk to someone. ROS, advice on eating disorders:{' '}
      <a className="font-semibold text-accent-2" href="tel:+4794817818">948 17 818</a>,{' '}
      <a className="font-semibold text-accent-2" href="https://www.nettros.no" target="_blank" rel="noreferrer">nettros.no</a>. Your GP can help too.
    </p>
  );
}

export function AboutFields({ state }: { state: GoalFormState }) {
  const { form, set, evaluation } = state;
  const under18 = evaluation.profileIssue === 'under_18' && form.age.trim() !== '';
  return (
    <>
      <div className={`mt-4 ${FULL_CHIPS}`}>
        <Chip selected={form.sex === 'male'} onClick={() => set({ sex: 'male' })}>Male</Chip>
        <Chip selected={form.sex === 'female'} onClick={() => set({ sex: 'female' })}>Female</Chip>
      </div>
      <p className="mt-1.5 text-[12px] text-secondary">Used only for the calorie estimate</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <NumberField label="Age" value={form.age} onChange={(age) => set({ age })} />
        <NumberField label="Height" unit="cm" value={form.height} onChange={(height) => set({ height })} />
        <NumberField label="Weight" unit="kg" value={form.weight} onChange={(weight) => set({ weight })} />
      </div>
      {under18 && (
        <div className="mt-3">
          <Notice>Makro is for people aged 18 and up.</Notice>
          <div className="mt-2"><HelpNote /></div>
        </div>
      )}
      <p className="mt-4 text-[13px] text-secondary">How active are you?</p>
      <div className="mt-2 flex flex-col gap-2">
        {ACTIVITY.map((a) => (
          <button
            key={a.value}
            type="button"
            aria-pressed={form.activity === a.value}
            onClick={() => set({ activity: a.value })}
            className={`rounded-2xl bg-card p-4 text-left text-[15px] font-semibold ${form.activity === a.value ? 'border-[1.5px] border-accent' : 'border border-border'}`}
          >
            {a.label}
          </button>
        ))}
      </div>
    </>
  );
}

export function GoalFields({ state, error }: { state: GoalFormState; error: string | null }) {
  const { form, set, evaluation: e } = state;
  const [showHelp, setShowHelp] = useState(false);
  const edit = (key: TargetKey) => (v: string) => set({ edits: { ...form.edits, [key]: v } });
  return (
    <>
      <div className={`mt-4 ${FULL_CHIPS}`}>
        {GOAL_TYPES.map((g) => (
          <Chip key={g.value} selected={form.goalType === g.value} onClick={() => set({ goalType: g.value, pace: String(g.pace), edits: {} })}>
            {g.label}
          </Chip>
        ))}
      </div>
      {form.goalType !== 'maintain' && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <NumberField label="Target weight" unit="kg, optional" value={form.targetWeight} onChange={(targetWeight) => set({ targetWeight })} />
          <NumberField label="Pace" unit="kg / week" value={form.pace} onChange={(pace) => set({ pace, edits: {} })} />
        </div>
      )}
      <div className="mt-3"><NumberField label="Daily calories" unit="kcal" value={e.shown.kcal} onChange={edit('kcal')} /></div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <NumberField label="Protein" unit="g" value={e.shown.protein} onChange={edit('protein')} />
        <NumberField label="Carbs" unit="g" value={e.shown.carbs} onChange={edit('carbs')} />
        <NumberField label="Fat" unit="g" value={e.shown.fat} onChange={edit('fat')} />
        <NumberField label="Fibre" unit="g" value={e.shown.fibre} onChange={edit('fibre')} />
      </div>
      {e.problem === 'below_floor' && form.sex && <div className="mt-3"><Notice>Makro doesn't set goals under {kcalFloor(form.sex)} kcal a day.</Notice></div>}
      {e.problem === 'pace_too_fast' && <div className="mt-3"><Notice>Makro doesn't set a pace above {GOAL_CONSTANTS.max_loss_kg_per_week} kg a week.</Notice></div>}
      {e.floored && <div className="mt-3"><Notice>This is the lowest goal Makro sets for you.</Notice></div>}
      {error && <div className="mt-3"><Notice tone="error">{error}</Notice></div>}
      <p className="mt-3 text-center text-[12px] text-secondary">
        An estimate you can change.{' '}
        <button type="button" className="font-semibold text-accent-2" onClick={() => setShowHelp(!showHelp)}>Need help?</button>
      </p>
      {showHelp && <div className="mt-2"><HelpNote /></div>}
    </>
  );
}
