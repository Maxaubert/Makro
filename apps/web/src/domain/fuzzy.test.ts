import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fuzzyGroups, SYNONYMS } from './fuzzy';
import { loadGolden } from './golden';
import { tokenise } from './normalise';
import type { VocabTerm } from './typos';

interface Input {
  query: string;
  token_matches: Record<string, number>;
  vocabulary: VocabTerm[];
}

const golden = loadGolden<Input, { groups: string[][][] }>('search/fuzzy.json');

describe('search/fuzzy.json', () => {
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const groups = fuzzyGroups(
      tokenise(c.input.query),
      (t) => {
        if (!(t in c.input.token_matches)) throw new Error(`${c.id}: no token_matches for ${t}`);
        return c.input.token_matches[t];
      },
      c.input.vocabulary,
    );
    expect(groups).toEqual(c.expected.groups);
  });
});

describe('search/synonyms.json', () => {
  it('the app uses exactly the shared pairs', () => {
    const file = JSON.parse(
      readFileSync(fileURLToPath(new URL('../../../../packages/contracts/search/synonyms.json', import.meta.url)), 'utf8'),
    ) as { pairs: [string, string][] };
    expect(SYNONYMS).toEqual(file.pairs);
  });
  it('every word is already normalised', () => {
    for (const pair of SYNONYMS) for (const w of pair) expect(tokenise(w)).toEqual([w]);
  });
});
