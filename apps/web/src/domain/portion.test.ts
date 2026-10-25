import { describe, it } from 'vitest';
import { expectClose, loadGolden, requireKeys } from './golden';
import { portion, type NutrientValues } from './portion';

const golden = loadGolden<{ per100g: NutrientValues; grams: number }, NutrientValues>('nutrition/portion.json');
const nutrients = golden.nutrients ?? [];

describe('nutrition/portion.json', () => {
  it('lists its nutrients', () => {
    if (nutrients.length === 0) throw new Error('portion.json has no nutrients list');
  });

  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    requireKeys(c.input.per100g, nutrients, `${id} input`);
    requireKeys(c.expected, nutrients, `${id} expected`);
    const actual = portion(c.input.per100g, c.input.grams, nutrients);
    for (const n of nutrients) expectClose(actual[n], c.expected[n] as number | null, `${id} ${n}`);
  });
});
