// Search normalisation, the same rule as normalise() in loftspace/nutrition-data
// tools/build_slim.py and the phone. Checked by packages/contracts/search/normalise.json.

const LETTERS: ReadonlyArray<readonly [string, string]> = [
  ['ø', 'o'],
  ['æ', 'ae'],
  ['å', 'a'],
  ['ä', 'a'],
  ['ö', 'o'],
  ['ü', 'u'],
  ['ß', 'ss'],
];

// Python strips characters with a non-zero canonical combining class. JavaScript cannot read
// that class, so nonspacing marks (Mn) stand in for it; for Latin text they are the same set.
const COMBINING = /\p{Mn}/gu;
const SEPARATOR = /[^\p{L}\p{N}]+/u;

/** Lowercase, then ø->o, æ->ae, å->a (and ä, ö, ü, ß), then strip other accents (NFKD). */
export function normalise(text: string): string {
  if (!text) return '';
  let out = text.toLowerCase();
  for (const [from, to] of LETTERS) out = out.split(from).join(to);
  return out.normalize('NFKD').replace(COMBINING, '');
}

/** Normalised text split on anything that is not a Unicode letter or number (FTS5 unicode61), no empties. */
export function tokenise(text: string): string[] {
  return normalise(text)
    .split(SEPARATOR)
    .filter((t) => t.length > 0);
}
