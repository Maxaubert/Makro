import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { expectClose, loadGolden } from './golden';
import { GOAL_CONSTANTS, ageFromBirthYear, birthYearFromAge, calculateTargets, goalProblem, gramsFromShares, kcalFromShares, moveBoundary, profileProblem, setShare, sharesFromGrams, type GoalInput, type GoalTargets, type LimitInput, type MacroBoundary, type MacroGrams, type Shares } from './goals';

describe('goals/macro_shares.json', () => {
  const golden = loadGolden<MacroGrams, Shares | null>('goals/macro_shares.json');
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(sharesFromGrams(c.input)).toEqual(c.expected);
  });
});

describe('goals/macro_grams.json', () => {
  type Out = { protein_g: number; carbs_g: number; fat_g: number; protein_kcal: number; carbs_kcal: number; fat_kcal: number };
  const golden = loadGolden<{ kcal: number; shares: Shares }, Out>('goals/macro_grams.json');
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const parts = kcalFromShares(c.input.kcal, c.input.shares);
    expect({ ...gramsFromShares(c.input.kcal, c.input.shares), protein_kcal: parts.protein, carbs_kcal: parts.carbs, fat_kcal: parts.fat }).toEqual(c.expected);
    expect(parts.protein + parts.carbs + parts.fat).toBe(c.input.kcal);
  });
});

describe('goals/macro_rebalance.json', () => {
  type In = { mode: 'set' | 'boundary'; shares: Shares; key: string; value: number };
  const golden = loadGolden<In, Shares>('goals/macro_rebalance.json');
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const { mode, shares, key, value } = c.input;
    const out = mode === 'set' ? setShare(shares, key as keyof Shares, value) : moveBoundary(shares, key as MacroBoundary, value);
    expect(out).toEqual(c.expected);
    expect(out.protein + out.carbs + out.fat).toBe(100);
  });
});

describe('goals/targets.json', () => {
  const golden = loadGolden<GoalInput, GoalTargets>('goals/targets.json');
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    const t = calculateTargets(c.input);
    for (const k of ['kcal_target', 'protein_g_target', 'fat_g_target', 'carbs_g_target', 'fibre_g_target'] as const) {
      expectClose(t[k], c.expected[k], `${id} ${k}`);
    }
    expect(t.floored, `${id} floored`).toBe(c.expected.floored);
  });
});

describe('goals/limits.json', () => {
  const golden = loadGolden<LimitInput, { problem: string | null }>('goals/limits.json');
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(goalProblem(c.input)).toBe(c.expected.problem);
  });
});

describe('goals/age.json', () => {
  const golden = loadGolden<{ birth_year: number; year: number }, { age: number }>('goals/age.json');
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    expectClose(ageFromBirthYear(c.input.birth_year, c.input.year), c.expected.age, `${id} age`);
    expectClose(birthYearFromAge(c.expected.age, c.input.year), c.input.birth_year, `${id} birth_year`);
  });
});

describe('goals/constants.json', () => {
  it('matches the numbers the app uses', () => {
    const path = fileURLToPath(new URL('../../../../packages/contracts/goals/constants.json', import.meta.url));
    const file = JSON.parse(readFileSync(path, 'utf8')) as { values: Record<string, { value: number }> };
    expect(Object.fromEntries(Object.entries(file.values).map(([k, v]) => [k, v.value]))).toEqual(GOAL_CONSTANTS);
  });
});

describe('profileProblem', () => {
  const ok = { age: 30, height_cm: 180, weight_kg: 80 };
  it('accepts a normal adult', () => expect(profileProblem(ok)).toBeNull());
  it('stops under 18', () => {
    expect(profileProblem({ ...ok, age: 17 })).toBe('under_18');
    expect(profileProblem({ ...ok, age: 18 })).toBeNull();
  });
  it('refuses numbers that cannot be a person', () => {
    expect(profileProblem({ ...ok, age: 121 })).toBe('age');
    expect(profileProblem({ ...ok, age: 30.5 })).toBe('age');
    expect(profileProblem({ ...ok, height_cm: 99 })).toBe('height');
    expect(profileProblem({ ...ok, weight_kg: 29 })).toBe('weight');
    expect(profileProblem({ ...ok, weight_kg: Number.NaN })).toBe('weight');
  });
});
