// Fuzzy search: what each query token may also match when the normal query and the typo step found
// too little (packages/contracts/products-db.md, Search step 7, cases in search/fuzzy.json).
// Pure and deterministic: the caller supplies the counts and the whole FTS vocabulary.
import { compareCodePoints, correctToken, TYPO_MIN_MATCHES, type VocabTerm } from './typos';

/** English and Norwegian food words that mean the same, both ways. Same as packages/contracts/search/synonyms.json. */
export const SYNONYMS: readonly (readonly [string, string])[] = [
  ['double', 'dobbel'], ['triple', 'trippel'], ['chicken', 'kylling'], ['cheese', 'ost'], ['milk', 'melk'],
  ['bread', 'brod'], ['salmon', 'laks'], ['coffee', 'kaffe'], ['chocolate', 'sjokolade'], ['ham', 'skinke'],
  ['sausage', 'polse'], ['potato', 'potet'], ['potatoes', 'poteter'], ['rice', 'ris'], ['apple', 'eple'],
  ['banana', 'banan'], ['strawberry', 'jordbaer'], ['raspberry', 'bringebaer'], ['blueberry', 'blabaer'],
  ['yogurt', 'yoghurt'], ['oats', 'havre'], ['butter', 'smor'], ['cream', 'flote'], ['beef', 'storfe'],
  ['pork', 'svin'], ['fish', 'fisk'], ['shrimp', 'reker'], ['tuna', 'tunfisk'], ['water', 'vann'],
  ['sugar', 'sukker'], ['pancake', 'pannekake'], ['waffle', 'vaffel'], ['salad', 'salat'], ['soup', 'suppe'],
  ['sauce', 'saus'], ['cookie', 'kjeks'], ['cinnamon', 'kanel'], ['bun', 'bolle'], ['vanilla', 'vanilje'],
  ['caramel', 'karamell'], ['peanut', 'peanott'], ['almond', 'mandel'], ['honey', 'honning'], ['lemon', 'sitron'],
  ['orange', 'appelsin'], ['pear', 'paere'], ['carrot', 'gulrot'], ['cucumber', 'agurk'], ['tomato', 'tomat'],
  ['onion', 'lok'], ['garlic', 'hvitlok'], ['mushroom', 'sopp'], ['beans', 'bonner'], ['lentils', 'linser'],
  ['noodles', 'nudler'], ['drink', 'drikk'], ['light', 'lett'], ['sugarfree', 'sukkerfri'], ['meatballs', 'kjottboller'],
];

/** Tokens shorter than this are never split, corrected or looked for inside longer words. */
const MIN_LENGTH = 4;
/** A longer word that holds the token may be at most this many characters longer ("wrap" in "mcwrap"). */
const CONTAINED_EXTRA = 6;
/** At most this many longer words per token, most held first. */
const CONTAINED_MAX = 5;
const HAS_NUMBER = /\p{N}/u;

/** One alternative: terms that must all match (more than one when a word is split). */
export type Alternative = string[];

const length = (s: string) => [...s].length;
const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The split of a joined word into two words of the file ("quarterpounder" into quarter + pounder), longest first part first. */
function split(token: string, docs: ReadonlyMap<string, number>, prefixes: (p: string) => boolean): Alternative | null {
  const chars = [...token];
  for (let i = chars.length - 1; i >= 2; i--) {
    const a = chars.slice(0, i).join('');
    const b = chars.slice(i).join('');
    if (!docs.has(a)) continue;
    if (docs.has(b) || (length(b) >= 3 && prefixes(b))) return [a, b];
  }
  return null;
}

/**
 * For each token, its alternatives in order: the token itself, its synonyms that the file holds,
 * then (only when the token alone finds fewer than 3 products) its typo correction and its split,
 * then the few longer words that hold it but do not start with it.
 */
export function fuzzyGroups(
  tokens: readonly string[],
  tokenMatches: (token: string) => number,
  vocabulary: readonly VocabTerm[],
): Alternative[][] {
  const docs = new Map(vocabulary.map((v) => [v.term, v.docs]));
  const sorted = vocabulary.map((v) => v.term).sort(byCodePoint);
  const prefixes = (p: string): boolean => {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < p) lo = mid + 1;
      else hi = mid;
    }
    return lo < sorted.length && sorted[lo].startsWith(p);
  };
  return tokens.map((token) => {
    const out: Alternative[] = [[token]];
    const add = (alt: Alternative) => {
      if (!out.some((o) => o.join(' ') === alt.join(' '))) out.push(alt);
    };
    const word = (w: string) => {
      add([w]);
      for (const [a, b] of SYNONYMS) {
        if (a === w && docs.has(b)) add([b]);
        if (b === w && docs.has(a)) add([a]);
      }
    };
    word(token);
    if (length(token) < MIN_LENGTH || HAS_NUMBER.test(token)) return out;
    const own = tokenMatches(token);
    if (own < TYPO_MIN_MATCHES) {
      const fixed = correctToken(token, own, vocabulary);
      if (fixed) word(fixed);
      // A stray key before the word ("odouble"): step 6 keeps the first letter, so it cannot see this.
      const rest = [...token].slice(1).join('');
      if (docs.has(rest)) word(rest);
      const parts = split(token, docs, prefixes);
      if (parts) add(parts);
    }
    vocabulary
      .filter((v) => v.term.includes(token) && !v.term.startsWith(token) && !HAS_NUMBER.test(v.term)
        && length(v.term) <= length(token) + CONTAINED_EXTRA)
      .sort((a, b) => b.docs - a.docs || compareCodePoints(a.term, b.term))
      .slice(0, CONTAINED_MAX)
      .forEach((v) => add([v.term]));
    return out;
  });
}
