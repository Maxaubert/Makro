import { describe, expect, it } from 'vitest';
import { loadGolden } from './golden';
import { tokenise } from './normalise';
import { correctTokens, editDistance, type VocabTerm } from './typos';

interface Input {
  query: string;
  query_matches: number;
  token_matches: Record<string, number>;
  vocabulary: VocabTerm[];
}

const golden = loadGolden<Input, { tokens: string[] }>('search/typos.json');

describe('search/typos.json', () => {
  it.each(golden.cases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const tokens = tokenise(c.input.query);
    const result = correctTokens(
      tokens,
      c.input.query_matches,
      (t) => {
        if (!(t in c.input.token_matches)) throw new Error(`${c.id}: no token_matches for ${t}`);
        return c.input.token_matches[t];
      },
      () => c.input.vocabulary,
    );
    expect(result ?? tokens).toEqual(c.expected.tokens);
  });
});

describe('correctTokens', () => {
  it('returns null when nothing changes, so the caller can skip a second search', () => {
    expect(correctTokens(['barebels'], 5, () => 0, () => [{ term: 'barebells', docs: 9 }])).toBeNull();
    expect(correctTokens(['qqqq'], 0, () => 0, () => [])).toBeNull();
  });
  it('reads nothing when the query already found enough', () => {
    const fail = () => {
      throw new Error('should not be asked');
    };
    expect(correctTokens(['barebels'], 3, fail, fail)).toBeNull();
  });
  it('reads the vocabulary only for tokens that can be corrected', () => {
    const asked: string[] = [];
    correctTokens(
      ['skyr', 'skr', '1450', 'mlek'],
      0,
      (t) => (t === 'skyr' ? 40 : 0),
      (first) => {
        asked.push(first);
        return [];
      },
    );
    expect(asked).toEqual(['m']);
  });
});

describe('editDistance', () => {
  it('counts insert, delete, replace and a swap of neighbours as one edit each', () => {
    expect(editDistance('melk', 'melk', 2)).toBe(0);
    expect(editDistance('barebels', 'barebells', 2)).toBe(1);
    expect(editDistance('barebells', 'barebels', 2)).toBe(1);
    expect(editDistance('melp', 'melk', 2)).toBe(1);
    expect(editDistance('mlek', 'melk', 2)).toBe(1);
  });
  it('gives up above the limit', () => {
    expect(editDistance('qwerty', 'asdfgh', 2)).toBeNull();
    expect(editDistance('melk', 'melkesjokolade', 2)).toBeNull();
  });
  it('counts characters, not UTF-16 units', () => {
    expect(editDistance('𝒳bcd', 'xbcd', 1)).toBe(1);
  });
});
