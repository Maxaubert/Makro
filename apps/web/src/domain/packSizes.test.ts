import { describe, expect, it } from 'vitest';
import { loadGolden, requireKeys } from './golden';
import { packAmounts, type PackAmount } from './packSizes';

type Input = { pack_size: string | null; per_100_unit: 'g' | 'ml' };
const golden = loadGolden<Input, PackAmount[]>('nutrition/pack_sizes.json');

describe('nutrition/pack_sizes.json', () => {
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (id, c) => {
    requireKeys(c.input, ['pack_size', 'per_100_unit'], `${id} input`);
    expect(packAmounts(c.input.pack_size, c.input.per_100_unit), id).toEqual(c.expected);
  });
});
