// The profile and goal form, shared by first-run setup and editing later (#73). Holds the typed
// text, works out what may be saved, and builds the rows. Every number comes from domain/goals.ts
// or from the user, inside the limits (accuracy rule 1). What a goal row does not hold stays empty.
import { buildGoal, buildWeightEntry, type GoalWriteRow, type StoredGoal, type WeightEntryRow } from './entry';
import { formatNumber } from './format';
import {
  ageFromBirthYear,
  birthYearFromAge,
  calculateTargets,
  goalProblem,
  gramsFromShares,
  kcalFromShares,
  kcalOfGrams,
  profileProblem,
  sharesFromGrams,
  sharesTotal,
  type ActivityLevel,
  type GoalProblem,
  type GoalTargets,
  type GoalType,
  type ProfileProblem,
  type Sex,
  type Shares,
} from './goals';

export type TargetKey = 'kcal' | 'protein' | 'carbs' | 'fat' | 'fibre';
/** The targets typed directly. Protein, carbs and fat follow from the calories and the split. */
export type EditKey = 'kcal' | 'fibre';
type Texts = Record<TargetKey, string>;

/** A saved goal whose macros are further than this from its calories gets repaired on the form. */
export const MACRO_KCAL_TOLERANCE = 10;

export interface GoalForm {
  sex: Sex | null;
  age: string;
  height: string;
  weight: string;
  activity: ActivityLevel;
  goalType: GoalType;
  pace: string;
  targetWeight: string;
  /** Targets typed by hand; they win over the calculated and the saved numbers. */
  edits: Partial<Record<EditKey, string>>;
  /** The split chosen by hand. Null follows the calculated or the saved macros. */
  shares: Shares | null;
}

/** What the goal row said when editing began. Null on first run. */
export interface GoalBaseline {
  /** The inputs the saved targets belong to; empty when the row lacks some of them. */
  inputs: string;
  targets: Texts;
  target_weight_kg: number | null;
  weight_kg: number | null;
}

export interface Prefill {
  form: GoalForm;
  baseline: GoalBaseline | null;
  /** The row holds a whole profile, so the goals can be edited without asking for it. */
  complete: boolean;
}

/** Typed text as a number. A comma is a decimal comma, except in thousands as the desktop field shows them (2,200 or 2 200). */
export const toNumber = (text: string): number => {
  const t = text.trim();
  if (t === '') return Number.NaN;
  if (/^\d{1,3}([, \u00a0]\d{3})+$/.test(t)) return Number(t.replace(/[, \u00a0]/g, ''));
  return Number(t.replace(',', '.'));
};

/** The goal row with a weight logged after it, so the form never starts from an old weight. */
export function withLatestWeight(goal: StoredGoal | null, latest: { weight_kg: number; measured_at: string } | null): StoredGoal | null {
  if (!goal || !latest || latest.measured_at <= goal.updated_at) return goal;
  return { ...goal, weight_kg: latest.weight_kg };
}

/** A change to About you. Calories typed by hand are dropped so the new estimate shows; the split and fibre stay. */
export const profileChange = (form: GoalForm, patch: Partial<GoalForm>): Partial<GoalForm> => ({
  ...patch,
  edits: form.edits.fibre === undefined ? {} : { fibre: form.edits.fibre },
});

const textOf = (n: number | null): string => (n === null ? '' : String(n));

export const emptyGoalForm = (): GoalForm => ({
  sex: null,
  age: '',
  height: '',
  weight: '',
  activity: 'active',
  goalType: 'maintain',
  pace: '0',
  targetWeight: '',
  edits: {},
  shares: null,
});

/** Which inputs produce the calculated targets. Target weight is not one of them. */
function inputsKey(f: GoalForm): string {
  return JSON.stringify([f.sex, toNumber(f.age), toNumber(f.height), toNumber(f.weight), f.activity, f.goalType, f.goalType === 'maintain' ? 0 : toNumber(f.pace)]);
}

export function prefillGoalForm(goal: StoredGoal | null, year: number): Prefill {
  if (!goal) return { form: emptyGoalForm(), baseline: null, complete: false };
  const form: GoalForm = {
    sex: goal.sex,
    age: goal.birth_year === null ? '' : String(ageFromBirthYear(goal.birth_year, year)),
    height: textOf(goal.height_cm),
    weight: textOf(goal.weight_kg),
    activity: goal.activity_level ?? 'active',
    goalType: goal.goal_type,
    pace: goal.goal_type === 'maintain' ? '0' : textOf(goal.pace_kg_per_week),
    targetWeight: textOf(goal.target_weight_kg),
    edits: {},
    shares: null,
  };
  const complete = goal.sex !== null && goal.birth_year !== null && goal.height_cm !== null && goal.weight_kg !== null && goal.activity_level !== null;
  return {
    form,
    complete,
    baseline: {
      inputs: complete ? inputsKey(form) : '',
      targets: {
        kcal: String(goal.kcal_target),
        protein: String(goal.protein_g_target),
        carbs: String(goal.carbs_g_target),
        fat: String(goal.fat_g_target),
        fibre: String(goal.fibre_g_target),
      },
      target_weight_kg: goal.target_weight_kg,
      weight_kg: goal.weight_kg,
    },
  };
}

export interface GoalEvaluation {
  profile: { age: number; height_cm: number; weight_kg: number };
  profileIssue: ProfileProblem | null;
  /** Calculated from the form, or null while the profile or pace is not valid. */
  targets: GoalTargets | null;
  /** The text in each target field. */
  shown: Texts;
  /** The split showing, or null until there is something to split. */
  shares: Shares | null;
  /** What the split adds up to. Only 100 may be saved. */
  sharesTotal: number | null;
  /** Each macro's part of the calories, adding up to exactly the calories. */
  macroKcal: Shares | null;
  /** What the saved macros added up to, when that did not match the saved calories and the form corrected it. */
  repairedFromKcal: number | null;
  /** The calculation hit the calorie floor, and that number is the one showing. */
  floored: boolean;
  problem: GoalProblem | null;
  /** The target weight is on the wrong side of the weight for the goal type. */
  targetIssue: 'not_below' | 'not_above' | null;
  aboutOk: boolean;
  canSave: boolean;
  /** Saving would write nothing new. */
  unchanged: boolean;
}

export function evaluateGoalForm(form: GoalForm, baseline: GoalBaseline | null): GoalEvaluation {
  const profile = { age: toNumber(form.age), height_cm: toNumber(form.height), weight_kg: toNumber(form.weight) };
  const profileIssue = profileProblem(profile);
  const pace = form.goalType === 'maintain' ? 0 : toNumber(form.pace);
  const targets =
    form.sex && !profileIssue && Number.isFinite(pace) && pace >= 0
      ? calculateTargets({ sex: form.sex, ...profile, activity_level: form.activity, goal_type: form.goalType, pace_kg_per_week: pace })
      : null;

  const useSaved = baseline !== null && baseline.inputs === inputsKey(form);
  const calculated: Record<TargetKey, number | undefined> = {
    kcal: targets?.kcal_target,
    protein: targets?.protein_g_target,
    carbs: targets?.carbs_g_target,
    fat: targets?.fat_g_target,
    fibre: targets?.fibre_g_target,
  };
  const base = (k: TargetKey): string => (useSaved ? baseline.targets[k] : calculated[k] === undefined ? '' : String(calculated[k]));
  const orNull = (text: string): number | null => (Number.isFinite(toNumber(text)) ? toNumber(text) : null);
  const baseGrams = { protein_g: orNull(base('protein')), carbs_g: orNull(base('carbs')), fat_g: orNull(base('fat')) };
  const baseKcal = toNumber(base('kcal'));
  const baseSum = kcalOfGrams(baseGrams);
  const matches = baseSum !== null && Math.abs(baseSum - baseKcal) <= MACRO_KCAL_TOLERANCE;
  const shares = form.shares ?? sharesFromGrams(baseGrams) ?? (targets ? sharesFromGrams({ protein_g: targets.protein_g_target, carbs_g: targets.carbs_g_target, fat_g: targets.fat_g_target }) : null);

  const kcalText = form.edits.kcal ?? base('kcal');
  const kcal = toNumber(kcalText);
  const kcalOk = Number.isFinite(kcal) && kcal >= 0;
  // Untouched macros that already match stay as they are, so a calculated 2 g per kg is not rounded away.
  const untouched = form.shares === null && (form.edits.kcal === undefined || kcal === baseKcal);
  const grams = kcalOk && shares ? gramsFromShares(kcal, shares) : null;
  const macroText = (key: 'protein' | 'carbs' | 'fat'): string => {
    if (untouched && matches) return base(key);
    return grams ? String(grams[`${key}_g`]) : '';
  };
  const shown: Texts = { kcal: kcalText, protein: macroText('protein'), carbs: macroText('carbs'), fat: macroText('fat'), fibre: form.edits.fibre ?? base('fibre') };
  const repairedFromKcal = useSaved && form.shares === null && form.edits.kcal === undefined && baseSum !== null && !matches ? baseSum : null;

  const numbers = (Object.keys(shown) as TargetKey[]).map((k) => toNumber(shown[k]));
  const numbersOk = numbers.every((n) => Number.isFinite(n) && n >= 0);
  const target = form.targetWeight.trim() === '' ? null : toNumber(form.targetWeight);
  const targetOk = target === null || (Number.isFinite(target) && target >= 30 && target <= 400);
  const paceOk = form.goalType === 'maintain' || (Number.isFinite(pace) && pace > 0);
  const problem = form.sex && numbersOk ? goalProblem({ sex: form.sex, goal_type: form.goalType, kcal_target: toNumber(shown.kcal), pace_kg_per_week: pace }) : null;
  const weightNow = profile.weight_kg;
  const targetIssue =
    target === null || !Number.isFinite(target) || !Number.isFinite(weightNow) || form.goalType === 'maintain'
      ? null
      : form.goalType === 'lose' && target >= weightNow
        ? ('not_below' as const)
        : form.goalType === 'gain' && target <= weightNow
          ? ('not_above' as const)
          : null;
  const splitOk = shares !== null && sharesTotal(shares) === 100;
  const canSave = !!form.sex && !!targets && numbersOk && targetOk && paceOk && !problem && !targetIssue && splitOk;

  const savedTargetWeight = form.goalType === 'maintain' ? null : target;
  const unchanged =
    useSaved &&
    savedTargetWeight === baseline.target_weight_kg &&
    (Object.keys(shown) as TargetKey[]).every((k) => toNumber(shown[k]) === toNumber(baseline.targets[k]));

  return {
    profile,
    profileIssue,
    targets,
    shown,
    shares,
    sharesTotal: shares ? sharesTotal(shares) : null,
    macroKcal: kcalOk && shares ? kcalFromShares(kcal, shares) : null,
    repairedFromKcal,
    floored: !!targets?.floored && !problem && !useSaved && form.edits.kcal === undefined,
    problem,
    targetIssue,
    aboutOk: !!form.sex && profileIssue === null,
    canSave,
    unchanged,
  };
}

/**
 * The rows a save writes. Throws when the form may not be saved, so the limits hold whatever the
 * screen does. The weight is null when it is the one the goal row already held.
 */
export function buildGoalChange(form: GoalForm, baseline: GoalBaseline | null, at: Date, tz: string): { goal: GoalWriteRow; weight: WeightEntryRow | null } {
  const e = evaluateGoalForm(form, baseline);
  if (!e.canSave || !form.sex) throw new Error('This goal cannot be saved.');
  const maintain = form.goalType === 'maintain';
  const goal = buildGoal({
    targets: {
      kcal_target: toNumber(e.shown.kcal),
      protein_g_target: toNumber(e.shown.protein),
      carbs_g_target: toNumber(e.shown.carbs),
      fat_g_target: toNumber(e.shown.fat),
      fibre_g_target: toNumber(e.shown.fibre),
    },
    goal_type: form.goalType,
    target_weight_kg: maintain || form.targetWeight.trim() === '' ? null : toNumber(form.targetWeight),
    pace_kg_per_week: maintain ? 0 : toNumber(form.pace),
    sex: form.sex,
    birth_year: birthYearFromAge(e.profile.age, at.getFullYear()),
    height_cm: e.profile.height_cm,
    activity_level: form.activity,
    weight_kg: e.profile.weight_kg,
    at,
    tz,
  });
  const weightChanged = !baseline || baseline.weight_kg !== e.profile.weight_kg;
  return { goal, weight: weightChanged ? buildWeightEntry({ weight_kg: e.profile.weight_kg, at, tz }) : null };
}

/** The value on the About you row of Account, leaving out what is unknown. */
export function aboutSummary(goal: StoredGoal | null, year: number): string {
  if (!goal) return 'Not set';
  const parts = [
    goal.birth_year === null ? null : String(ageFromBirthYear(goal.birth_year, year)),
    goal.height_cm === null ? null : `${formatNumber(goal.height_cm, 1)} cm`,
    goal.weight_kg === null ? null : `${formatNumber(goal.weight_kg, 1)} kg`,
  ].filter((p) => p !== null);
  return parts.length > 0 ? parts.join(' · ') : 'Not set';
}

export const goalsSummary = (goal: StoredGoal | null): string => (goal ? `${formatNumber(goal.kcal_target, 0)} kcal` : 'Not set');

/** Goals can open first only on a whole profile that passes the limits; else Save would sit disabled with no reason shown. */
export const canStartAtGoals = (p: Prefill): boolean => p.complete && evaluateGoalForm(p.form, p.baseline).aboutOk;
