import { describe, expect, it } from 'vitest';
import { expectClose, loadGolden, requireKeys } from './golden';
import { resolveGrams, type AmountUnit } from './grams';

type GramsInput = { quantity: number; unit: AmountUnit; serving_g: number | null };
type GramsExpected = { grams: number | null; approximate: boolean };
const golden = loadGolden<GramsInput, GramsExpected>('nutrition/grams.json');

describe('nutrition/grams.json', () => {
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    requireKeys(c.input, ['quantity', 'unit', 'serving_g'], `${id} input`);
    requireKeys(c.expected, ['grams', 'approximate'], `${id} expected`);
    const actual = resolveGrams(c.input);
    expectClose(actual.grams, c.expected.grams, `${id} grams`);
    expect(actual.approximate, `${id} approximate`).toBe(c.expected.approximate);
  });

  it('rejects an unknown unit instead of guessing', () => {
    expect(() => resolveGrams({ quantity: 1, unit: 'cup' as AmountUnit, serving_g: 100 })).toThrow();
  });
});
