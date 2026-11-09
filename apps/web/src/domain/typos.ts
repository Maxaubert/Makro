// Typo correction of search query tokens against the product file's FTS vocabulary
// (packages/contracts/products-db.md, Search step 6, cases in search/typos.json).
// Pure and deterministic: the caller supplies the counts and the vocabulary.

/** A query or token that finds at least this many products is good enough to leave alone. */
export const TYPO_MIN_MATCHES = 3;

/** Shorter tokens have too many neighbours to correct safely. */
const MIN_LENGTH = 4;

const HAS_NUMBER = /\p{N}/u;

export interface VocabTerm {
  term: string;
  /** How many products hold this term. */
  docs: number;
}

/** Most edits allowed for a token of this many characters. */
function maxEdits(length: number): number {
  return length >= 8 ? 2 : 1;
}

/**
 * Edit distance where inserting, deleting or replacing a character and swapping two neighbours
 * cost one edit each (optimal string alignment), or null when it is above `limit`.
 * Counts Unicode code points, not UTF-16 units.
 */
export function editDistance(a: string, b: string, limit: number): number | null {
  const s = [...a];
  const t = [...b];
  if (Math.abs(s.length - t.length) > limit) return null;
  let before2: number[] = [];
  let before = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= t.length; j++) {
      const replace = before[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1);
      let d = Math.min(before[j] + 1, row[j - 1] + 1, replace);
      if (i > 1 && j > 1 && s[i - 1] === t[j - 2] && s[i - 2] === t[j - 1]) d = Math.min(d, before2[j - 2] + 1);
      row.push(d);
      if (d < best) best = d;
    }
    // Two rows back still feeds a swap, so stop only when that row is over the limit as well.
    if (best > limit && Math.min(...before) > limit) return null;
    before2 = before;
    before = row;
  }
  const d = before[t.length];
  return d <= limit ? d : null;
}

function compareCodePoints(a: string, b: string): number {
  const s = [...a];
  const t = [...b];
  for (let i = 0; i < Math.min(s.length, t.length); i++) {
    const diff = (s[i].codePointAt(0) as number) - (t[i].codePointAt(0) as number);
    if (diff !== 0) return diff;
  }
  return s.length - t.length;
}

function firstCharacter(text: string): string {
  return String.fromCodePoint(text.codePointAt(0) as number);
}

function chooseCorrection(token: string, ownMatches: number, terms: readonly VocabTerm[]): string | null {
  const limit = maxEdits([...token].length);
  const first = firstCharacter(token);
  let best: { term: string; docs: number; distance: number } | null = null;
  for (const { term, docs } of terms) {
    if (term === token || docs <= ownMatches || !term.startsWith(first) || HAS_NUMBER.test(term)) continue;
    const distance = editDistance(token, term, limit);
    if (distance === null) continue;
    const better =
      best === null ||
      distance < best.distance ||
      (distance === best.distance &&
        (docs > best.docs || (docs === best.docs && compareCodePoints(term, best.term) < 0)));
    if (better) best = { term, docs, distance };
  }
  return best?.term ?? null;
}

/**
 * The tokens to search with instead, or null when nothing changes. A token is corrected only
 * when the whole query and the token itself both found fewer than TYPO_MIN_MATCHES products.
 * `vocabulary` gets a first character and needs to return at least the terms starting with it.
 */
export function correctTokens(
  tokens: readonly string[],
  queryMatches: number,
  tokenMatches: (token: string) => number,
  vocabulary: (first: string) => readonly VocabTerm[],
): string[] | null {
  if (queryMatches >= TYPO_MIN_MATCHES) return null;
  let changed = false;
  const out = tokens.map((token) => {
    if ([...token].length < MIN_LENGTH || HAS_NUMBER.test(token)) return token;
    const own = tokenMatches(token);
    if (own >= TYPO_MIN_MATCHES) return token;
    const correction = chooseCorrection(token, own, vocabulary(firstCharacter(token)));
    if (correction === null) return token;
    changed = true;
    return correction;
  });
  return changed ? out : null;
}
