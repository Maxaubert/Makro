import { describe, expect, it } from 'vitest';
import { loadGolden } from './golden';
import { normalise, tokenise } from './normalise';

const golden = loadGolden<string, { normalised: string; tokens: string[] }>('search/normalise.json');

describe('search/normalise.json', () => {
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    expect(normalise(c.input)).toBe(c.expected.normalised);
    expect(tokenise(c.input)).toEqual(c.expected.tokens);
  });
});
