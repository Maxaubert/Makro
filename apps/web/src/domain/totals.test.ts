import { describe, expect, it } from 'vitest';
import { expectClose, loadGolden, requireKeys } from './golden';
import type { NutrientValues } from './portion';
import { dayTotals, type NutrientTotal } from './totals';

const golden = loadGolden<{ items: NutrientValues[] }, Record<string, NutrientTotal>>('nutrition/totals.json');
const nutrients = golden.nutrients ?? [];

describe('nutrition/totals.json', () => {
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    c.input.items.forEach((item, i) => requireKeys(item, nutrients, `${id} item ${i}`));
    requireKeys(c.expected, nutrients, `${id} expected`);
    const actual = dayTotals(c.input.items, nutrients);
    for (const n of nutrients) {
      expectClose(actual[n].value, c.expected[n].value, `${id} ${n} value`);
      expect(actual[n].covered, `${id} ${n} covered`).toBe(c.expected[n].covered);
      expect(actual[n].count, `${id} ${n} count`).toBe(c.expected[n].count);
    }
  });

  it('treats a missing key on an item as unknown, not zero', () => {
    const t = dayTotals([{ kcal: 100 }, {}], ['kcal', 'protein_g']);
    expect(t.kcal).toEqual({ value: 100, covered: 1, count: 2 });
    expect(t.protein_g).toEqual({ value: null, covered: 0, count: 2 });
  });
});
