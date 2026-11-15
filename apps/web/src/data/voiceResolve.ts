// Voice and typed logging, step 2 (decision 49): each parsed item is looked up with the normal product
// search, and the best few candidates are kept for the user to confirm. Code picks, not AI (rule 1);
// nothing here makes a nutrition number. An item with no match becomes a custom food (rule 5).
import { SYNONYMS } from '../domain/fuzzy';
import type { ParsedItem } from '../domain/voice';
import { searchProducts, type Popularity, type Product } from './products';
import type { Sql } from './sql';

export interface ResolvedItem extends ParsedItem {
  /** The best match first; empty when nothing matched, so the app offers a custom food. */
  candidates: Product[];
}

/** Spoken English phrases and plurals, on top of the search synonyms (search/synonyms.json). */
const VOICE_ENGLISH: readonly (readonly [string, string])[] = [
  ['orange juice', 'appelsinjuice'], ['apple juice', 'eplejuice'], ['chicken breast', 'kyllingfilet'], ['ground beef', 'kjøttdeig'],
  ['minced meat', 'kjøttdeig'], ['peanut butter', 'peanøttsmør'], ['brown cheese', 'brunost'], ['greek yoghurt', 'gresk yoghurt'],
  ['greek yogurt', 'gresk yoghurt'], ['scrambled eggs', 'eggerøre'], ['eggs scrambled', 'eggerøre'], ['sour cream', 'rømme'],
  ['eggs', 'egg'], ['almonds', 'mandler'], ['apples', 'eple'], ['bananas', 'banan'], ['oranges', 'appelsin'], ['blueberries', 'blåbær'],
  ['strawberries', 'jordbær'], ['raspberries', 'bringebær'], ['carrots', 'gulrot'], ['tomatoes', 'tomat'], ['onions', 'løk'],
  ['tea', 'te'], ['porridge', 'grøt'], ['oatmeal', 'havregrøt'], ['avocado', 'avokado'], ['broccoli', 'brokkoli'], ['lasagna', 'lasagne'],
  ['coffees', 'kaffe'], ['bread', 'brød'], ['butter', 'smør'], ['cheese', 'ost'], ['milk', 'melk'], ['rice', 'ris'], ['salmon', 'laks'],
  ['potatoes', 'poteter'], ['potato', 'potet'], ['chicken', 'kylling'], ['apple', 'eple'], ['banana', 'banan'], ['orange', 'appelsin'],
  ['shrimp', 'reker'], ['tuna', 'tunfisk'], ['water', 'vann'], ['yogurt', 'yoghurt'], ['oats', 'havregryn'], ['cucumber', 'agurk'],
];
const ENGLISH = new Map<string, string>([...SYNONYMS.map(([en, nb]) => [en, nb] as const), ...VOICE_ENGLISH]);

/** The query with English food words in Norwegian, longest phrases first. null when nothing changed. */
export function norwegianQuery(query: string): string | null {
  let s = ` ${query} `;
  const phrases = [...ENGLISH.keys()].sort((a, b) => b.length - a.length);
  for (const en of phrases) s = s.split(` ${en} `).join(` ${ENGLISH.get(en)} `);
  const out = s.trim().replace(/\s+/g, ' ');
  return out === query ? null : out;
}

/** A plain food from the national food table (no brand): what a bare word like "egg" or "kaffe" means. */
const isGeneric = (p: Product) => p.brand === null && (p.id.startsWith('matvaretabellen:') || p.id.startsWith('generic:'));
const fold = (s: string) => s.toLowerCase().replace(/ø/g, 'o').replace(/æ/g, 'ae').normalize('NFKD').replace(/\p{M}/gu, '');

/**
 * The plain food a bare word means: a food-table entry whose name, up to the first comma, is the word
 * ("Smør", not "Smørkrem") or its singular ("poteter" -> "Potet"). The exact name first, then the shortest.
 */
function plainFood(found: Product[], head: string): Product | undefined {
  const first = (p: Product) => fold(p.name.split(',')[0].trim());
  const matches = (p: Product) => {
    const f = first(p);
    return f === head || (f.length >= 4 && head.startsWith(f) && head.length - f.length <= 2);
  };
  return found
    .filter((p) => isGeneric(p) && matches(p))
    .sort((a, b) => Number(first(b) === head) - Number(first(a) === head) || a.name.length - b.name.length)[0];
}

/**
 * Search the whole query (in Norwegian when it was English) first; with no hit, drop words from the
 * front, then from the end. A one- or two-word query prefers the plain food-table entry with that name
 * ("egg" -> "Egg, rå", not a brand of eggs).
 */
export function resolveItem(sql: Sql, item: ParsedItem, popularity?: Popularity, limit = 5): ResolvedItem {
  const nb = norwegianQuery(item.query);
  const base = nb ?? item.query;
  const words = base.split(' ').filter(Boolean);
  const tries = [base];
  if (nb) tries.push(item.query);
  for (let i = 1; i < words.length; i++) tries.push(words.slice(i).join(' '));
  for (let i = words.length - 1; i >= 1; i--) tries.push(words.slice(0, i).join(' '));
  for (const q of tries) {
    const found = searchProducts(sql, q, 50, popularity);
    if (found.length === 0) continue;
    const plain = q.split(' ').length <= 2 ? plainFood(found, fold(q)) : undefined;
    const ordered = plain ? [plain, ...found.filter((p) => p !== plain)] : found;
    return { ...item, candidates: ordered.slice(0, limit) };
  }
  return { ...item, candidates: [] };
}

export function resolveItems(sql: Sql, items: ParsedItem[], popularity?: Popularity): ResolvedItem[] {
  return items.map((i) => resolveItem(sql, i, popularity));
}
