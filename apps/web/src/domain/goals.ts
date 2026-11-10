// Daily targets from a profile, and the limits on a goal (decision 38). Deterministic code only:
// AI never produces a number (accuracy rule 1). Checked by packages/contracts/goals/*.json, which
// also says how far each constant is confirmed; the floors and the loss cap are provisional.

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

/** Whole percents of the calories. Always adds up to exactly 100. */
export interface Shares {
  protein: number;
  carbs: number;
  fat: number;
}

export type MacroKey = keyof Shares;
export type MacroBoundary = 'protein_carbs' | 'carbs_fat';

const MACRO_ORDER: MacroKey[] = ['protein', 'carbs', 'fat'];

/** Each part rounded down, the leftover to the largest remainders; a tie goes to the earlier macro. */
function largestRemainder(parts: Shares, total: number): Shares {
  const floors = { protein: Math.floor(parts.protein), carbs: Math.floor(parts.carbs), fat: Math.floor(parts.fat) };
  let left = total - floors.protein - floors.carbs - floors.fat;
  const byRemainder = [...MACRO_ORDER].sort((a, b) => parts[b] - floors[b] - (parts[a] - floors[a]));
  for (const k of byRemainder) {
    if (left <= 0) break;
    floors[k] += 1;
    left -= 1;
  }
  return floors;
}

/** What the gram targets are worth in kcal, or null when one is unknown. */
export function kcalOfGrams(g: MacroGrams): number | null {
  if (g.protein_g === null || g.carbs_g === null || g.fat_g === null) return null;
  return g.protein_g * 4 + g.carbs_g * 4 + g.fat_g * 9;
}

/** The split the gram targets make (goals/macro_shares.json). Unknown stays unknown. */
export function sharesFromGrams(g: MacroGrams): Shares | null {
  const total = kcalOfGrams(g);
  if (total === null || total === 0) return null;
  const pct = (kcal: number) => (kcal * 100) / total;
  return largestRemainder({ protein: pct(g.protein_g! * 4), carbs: pct(g.carbs_g! * 4), fat: pct(g.fat_g! * 9) }, 100);
}

/** Gram targets for a calorie target and a split (goals/macro_grams.json). Carbs take the rounding. */
export function gramsFromShares(kcal: number, s: Shares): { protein_g: number; carbs_g: number; fat_g: number } {
  const protein_g = Math.round((kcal * s.protein) / 400);
  const fat_g = Math.round((kcal * s.fat) / 900);
  const carbs_g = s.carbs === 0 ? 0 : Math.max(0, Math.round((kcal - protein_g * 4 - fat_g * 9) / 4));
  return { protein_g, carbs_g, fat_g };
}

/** Each macro's part of the calories in kcal, adding up to exactly the target (goals/macro_grams.json). */
export function kcalFromShares(kcal: number, s: Shares): Shares {
  const total = Math.round(kcal);
  return largestRemainder({ protein: (total * s.protein) / 100, carbs: (total * s.carbs) / 100, fat: (total * s.fat) / 100 }, total);
}

const percent = (value: number, max = 100, min = 0): number => Math.min(max, Math.max(min, Math.round(value)));

/** Change one macro and keep the three at 100 (goals/macro_rebalance.json). */
export function setShare(s: Shares, key: MacroKey, value: number): Shares {
  const v = percent(value);
  const [first, second]: MacroKey[] = key === 'carbs' ? ['fat', 'protein'] : key === 'protein' ? ['carbs', 'fat'] : ['carbs', 'protein'];
  const firstValue = s[first] + s[key] - v;
  if (firstValue >= 0) return { ...s, [key]: v, [first]: firstValue };
  return { ...s, [key]: v, [first]: 0, [second]: s[second] + firstValue } as Shares;
}

/** Move a divider on the split bar to a position from the left (goals/macro_rebalance.json). */
export function moveBoundary(s: Shares, boundary: MacroBoundary, at: number): Shares {
  if (boundary === 'protein_carbs') {
    const protein = percent(at, s.protein + s.carbs);
    return { protein, carbs: s.protein + s.carbs - protein, fat: s.fat };
  }
  const end = percent(at, 100, s.protein);
  return { protein: s.protein, carbs: end - s.protein, fat: 100 - end };
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
