// Daily targets from a profile, and the limits on a goal (decision 38). Deterministic code only:
// AI never produces a number (accuracy rule 1). Checked by packages/contracts/goals/*.json, which
// also says how far each constant is confirmed; the floors and the loss cap are provisional.
import { roundForDisplay } from './display';

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'active' | 'very_active';
export type GoalType = 'lose' | 'maintain' | 'gain';

export const GOAL_CONSTANTS = {
  kcal_floor_female: 1200,
  kcal_floor_male: 1500,
  max_loss_kg_per_week: 1,
  kcal_per_kg: 7700,
  protein_g_per_kg: 2.0,
  fat_min_energy_fraction: 0.25,
  fibre_g: 30,
  activity_sedentary: 1.2,
  activity_active: 1.55,
  activity_very_active: 1.725,
};

const ACTIVITY: Record<ActivityLevel, number> = {
  sedentary: GOAL_CONSTANTS.activity_sedentary,
  active: GOAL_CONSTANTS.activity_active,
  very_active: GOAL_CONSTANTS.activity_very_active,
};

export interface GoalInput {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_kg: number;
  activity_level: ActivityLevel;
  goal_type: GoalType;
  pace_kg_per_week: number;
}

export interface GoalTargets {
  kcal_target: number;
  protein_g_target: number;
  fat_g_target: number;
  carbs_g_target: number;
  fibre_g_target: number;
  /** The calculation came out under the floor, so the floor is used instead. */
  floored: boolean;
}

export const kcalFloor = (sex: Sex): number =>
  sex === 'male' ? GOAL_CONSTANTS.kcal_floor_male : GOAL_CONSTANTS.kcal_floor_female;

export function calculateTargets(i: GoalInput): GoalTargets {
  const bmr = 10 * i.weight_kg + 6.25 * i.height_cm - 5 * i.age + (i.sex === 'male' ? 5 : -161);
  const daily = (i.pace_kg_per_week * GOAL_CONSTANTS.kcal_per_kg) / 7;
  const shift = i.goal_type === 'lose' ? -daily : i.goal_type === 'gain' ? daily : 0;
  const raw = Math.round((bmr * ACTIVITY[i.activity_level] + shift) / 10) * 10;
  const floor = kcalFloor(i.sex);
  const kcal = Math.max(raw, floor);
  const protein = Math.round(i.weight_kg * GOAL_CONSTANTS.protein_g_per_kg);
  const fat = Math.round((kcal * GOAL_CONSTANTS.fat_min_energy_fraction) / 9);
  return {
    kcal_target: kcal,
    protein_g_target: protein,
    fat_g_target: fat,
    carbs_g_target: Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4)),
    fibre_g_target: GOAL_CONSTANTS.fibre_g,
    floored: raw < floor,
  };
}

export interface LimitInput {
  sex: Sex;
  goal_type: GoalType;
  kcal_target: number;
  pace_kg_per_week: number;
}

export type GoalProblem = 'below_floor' | 'pace_too_fast';

/** Why a goal may not be saved, or null. Applies to calculated and hand-edited goals alike. */
export function goalProblem(i: LimitInput): GoalProblem | null {
  if (i.kcal_target < kcalFloor(i.sex)) return 'below_floor';
  if (i.goal_type === 'lose' && i.pace_kg_per_week > GOAL_CONSTANTS.max_loss_kg_per_week) return 'pace_too_fast';
  return null;
}

export interface MacroGrams {
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

export interface MacroPart {
  kcal: number | null;
  /** A whole percent of the three together, or null when that total is unknown or 0. */
  share: number | null;
}

export type MacroSplit = Record<'protein' | 'carbs' | 'fat', MacroPart>;

/** What each macro target is worth in kcal and its share (goals/macro_split.json). Unknown stays unknown. */
export function macroSplit(g: MacroGrams): MacroSplit {
  const kcal = (grams: number | null, perGram: number) => (grams === null ? null : grams * perGram);
  const protein = kcal(g.protein_g, 4);
  const carbs = kcal(g.carbs_g, 4);
  const fat = kcal(g.fat_g, 9);
  const total = protein === null || carbs === null || fat === null ? null : protein + carbs + fat;
  const part = (k: number | null): MacroPart => ({
    kcal: k,
    share: k === null || total === null || total === 0 ? null : roundForDisplay((k / total) * 100, 0),
  });
  return { protein: part(protein), carbs: part(carbs), fat: part(fat) };
}

export const WEIGHT_RANGE_KG = { min: 30, max: 400 };

export type ProfileProblem ='under_18' | 'age' | 'height' | 'weight';

export function profileProblem(p: { age: number; height_cm: number; weight_kg: number }): ProfileProblem | null {
  if (!Number.isInteger(p.age) || p.age < 0 || p.age > 120) return 'age';
  if (p.age < 18) return 'under_18';
  if (!Number.isFinite(p.height_cm) || p.height_cm < 100 || p.height_cm > 250) return 'height';
  if (!Number.isFinite(p.weight_kg) || p.weight_kg < WEIGHT_RANGE_KG.min || p.weight_kg > WEIGHT_RANGE_KG.max) return 'weight';
  return null;
}

/** By calendar year, as goals store a birth year and not a date (goals/age.json). */
export const ageFromBirthYear = (birthYear: number, year: number): number => year - birthYear;
export const birthYearFromAge = (age: number, year: number): number => year - age;
