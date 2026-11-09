import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { expectClose, loadGolden } from './golden';
import { GOAL_CONSTANTS, ageFromBirthYear, birthYearFromAge, calculateTargets, goalProblem, macroSplit, profileProblem, type GoalInput, type GoalTargets, type LimitInput, type MacroGrams } from './goals';

describe('goals/macro_split.json', () => {
  type Split = Record<'protein_kcal' | 'carbs_kcal' | 'fat_kcal' | 'protein_share' | 'carbs_share' | 'fat_share', number | null>;
  const golden = loadGolden<MacroGrams, Split>('goals/macro_split.json');
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    const s = macroSplit(c.input);
    const actual: Split = {
      protein_kcal: s.protein.kcal,
      carbs_kcal: s.carbs.kcal,
      fat_kcal: s.fat.kcal,
      protein_share: s.protein.share,
      carbs_share: s.carbs.share,
      fat_share: s.fat.share,
    };
    for (const k of Object.keys(c.expected) as (keyof Split)[]) {
      const want = c.expected[k];
      if (want === null) expect(actual[k], `${id} ${k}`).toBeNull();
      else expectClose(actual[k] as number, want, `${id} ${k}`);
    }
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
