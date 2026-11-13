// Read-only access to products.sqlite, following packages/contracts/products-db.md v1.
// Nutrients are per 100 per_100_unit and null when unknown (never read as 0, rule 2).
// Every product carries its source and verified flag so the UI can show them (rule 4).
import { canonicalEan } from './barcode';
import { NUTRIENTS, type Nutrient } from '../domain/nutrients';
import { tokenise } from '../domain/normalise';
import { fuzzyGroups, type Alternative } from '../domain/fuzzy';
import { correctTokens, TYPO_MIN_MATCHES, type VocabTerm } from '../domain/typos';
import type { Sql } from './sql';

/** Oldest product file schema this client reads (v1 of the contract is schema_version 2). */
export const MIN_SCHEMA_VERSION = 2;

/** g or ml: values per 100 g/ml. portion: values per one portion as printed (restaurants with no weights, decision 42). */
export type Per100Unit = 'g' | 'ml' | 'portion';

/** What a food's values are per, for labels: "100 g", "100 ml" or "portion". */
export function perLabel(unit: Per100Unit): string {
  return unit === 'portion' ? 'portion' : `100 ${unit}`;
}

export interface Product {
  id: string;
  name: string;
  brand: string | null;
  pack_size: string | null;
  ean: string | null;
  serving_g: number | null;
  per_100_unit: Per100Unit;
  source: string;
  source_name: string;
  source_kind: string | null;
  verified: boolean;
  data_quality: string[];
  nutrients: Record<Nutrient, number | null>;
}

export interface ProductMeta {
  db_version: string;
  schema_version: number;
  variant: string | null;
}

export function readProductMeta(sql: Sql): ProductMeta {
  const rows = sql.all<{ key: string; value: string }>('select key, value from meta');
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!m.db_version || !m.schema_version) throw new Error('product file has no db_version or schema_version');
  return { db_version: m.db_version, schema_version: Number(m.schema_version), variant: m.variant ?? null };
}

export function assertSupportedSchema(meta: { schema_version: number }): void {
  if (!(meta.schema_version >= MIN_SCHEMA_VERSION)) {
    throw new Error(
      `product file has schema_version ${meta.schema_version}; this app needs ${MIN_SCHEMA_VERSION} or newer`,
    );
  }
}

/** FTS5 MATCH text: every token quoted, AND-joined, `*` on tokens of 2+ characters. null = no query. */
export function buildMatchQuery(query: string): string | null {
  const tokens = tokenise(query);
  return tokens.length === 0 ? null : matchTokens(tokens);
}

function matchTokens(tokens: readonly string[]): string {
  return tokens.map((t) => `"${t.replace(/"/g, '""')}"${t.length >= 2 ? '*' : ''}`).join(' ');
}

type ProductRow = Record<string, string | number | null>;

const SELECT = `select p.*, s.display_name as source_name, s.kind as source_kind
  from products p left join sources s on s.slug = p.source`;

function toProduct(r: ProductRow): Product {
  const nutrients = {} as Record<Nutrient, number | null>;
  for (const n of NUTRIENTS) nutrients[n] = r[n] === null || r[n] === undefined ? null : Number(r[n]);
  let dq: string[] = [];
  if (typeof r.data_quality === 'string') {
    try {
      const parsed = JSON.parse(r.data_quality);
      if (Array.isArray(parsed)) dq = parsed.map(String);
    } catch {
      dq = [];
    }
  }
  return {
    id: String(r.id),
    name: String(r.name),
    brand: (r.brand as string | null) ?? null,
    pack_size: (r.pack_size as string | null) ?? null,
    ean: (r.ean as string | null) ?? null,
    serving_g: r.serving_g === null || r.serving_g === undefined ? null : Number(r.serving_g),
    per_100_unit: r.per_100_unit === 'ml' ? 'ml' : r.per_100_unit === 'portion' ? 'portion' : 'g',
    source: String(r.source),
    source_name: (r.source_name as string | null) ?? String(r.source),
    source_kind: (r.source_kind as string | null) ?? null,
    verified: Number(r.verified) === 1,
    data_quality: dq,
    nutrients,
  };
}

/** The line under a product name: brand and sizes. A food from a food table has no brand, so it reads Generic. */
export function productSubtext(p: Pick<Product, 'brand' | 'pack_size' | 'source_kind'>): string | null {
  const brand = p.brand ?? (p.source_kind === 'government' ? 'Generic' : null);
  return [brand, p.pack_size].filter(Boolean).join(' · ') || null;
}

export interface PopularityScore {
  /** How many of your own live log entries are this product. */
  mine: number;
  /** How many people log it, and how often (0 when under the privacy floor). */
  users: number;
  logs: number;
}
export type Popularity = Map<string, PopularityScore>;

/** Counts keyed by the current product id: logs of a merged listing count for the product it became. */
export function resolvePopularity(
  sql: Sql,
  mine: readonly { product_id: string; n: number }[],
  global: readonly { product_id: string; users: number; logs: number }[],
): Popularity {
  const ids = [...new Set([...mine, ...global].map((r) => r.product_id))];
  const moved = new Map<string, string>();
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500);
    const rows = sql.all<{ old_id: string; new_id: string }>(
      `select old_id, new_id from redirects where old_id in (${part.map(() => '?').join(', ')})`,
      part,
    );
    for (const r of rows) moved.set(r.old_id, r.new_id);
  }
  const out: Popularity = new Map();
  const score = (id: string): PopularityScore => {
    const key = moved.get(id) ?? id;
    let s = out.get(key);
    if (!s) out.set(key, (s = { mine: 0, users: 0, logs: 0 }));
    return s;
  };
  for (const r of mine) score(r.product_id).mine += r.n;
  for (const r of global) {
    const s = score(r.product_id);
    s.users = Math.max(s.users, r.users); // one person may have logged both listings
    s.logs += r.logs;
  }
  return out;
}

/** How many popular products are looked for beyond the 500 best text matches. */
const POPULAR_CANDIDATES = 800;

const comparePopularity = (a: PopularityScore, b: PopularityScore): number =>
  b.mine - a.mine || b.users - a.users || b.logs - a.logs;

/** How many everyday foods (common set) are looked for beyond the 500 best text matches. */
const COMMON_CANDIDATES = 300;

/** Files from 2026.11.12 on have products.common (1 to 3: how common the food is in Norwegian shops). */
const commonColumn = new WeakMap<Sql, boolean>();
function hasCommon(sql: Sql): boolean {
  let has = commonColumn.get(sql);
  if (has === undefined) {
    has = sql.all<{ name: string }>('pragma table_info(products)').some((c) => c.name === 'common');
    commonColumn.set(sql, has);
  }
  return has;
}

const NO_SCORE: PopularityScore = { mine: 0, users: 0, logs: 0 };

type RankableRow = ProductRow & { _bm25: number };

/** Up to 500 best text matches, plus popular foods that match but fell outside them. */
function matchingRows(sql: Sql, match: string, popularity?: Popularity): RankableRow[] {
  const FROM = `select p.*, s.display_name as source_name, s.kind as source_kind, bm25(products_fts) as _bm25
       from products_fts f join products p on p.rowid = f.rowid left join sources s on s.slug = p.source
      where products_fts match ?`;
  const rows = sql.all<RankableRow>(
    `${FROM} order by bm25(products_fts), length(p.search_text), p.id limit 500`,
    [match],
  );
  if (popularity && popularity.size > 0) {
    // A much-logged food can sit outside the 500 best text matches of a common word.
    const top = [...popularity.entries()]
      .sort((a, b) => comparePopularity(a[1], b[1]))
      .slice(0, POPULAR_CANDIDATES)
      .map(([id]) => id);
    const seen = new Set(rows.map((r) => String(r.id)));
    const extra = sql.all<RankableRow>(
      `${FROM} and p.id in (${top.map(() => '?').join(', ')})`,
      [match, ...top],
    );
    for (const r of extra) if (!seen.has(String(r.id))) rows.push(r);
  }
  if (hasCommon(sql)) {
    // An everyday food can also sit outside them ("melk" matches hundreds of products).
    const seen = new Set(rows.map((r) => String(r.id)));
    const common = sql.all<RankableRow>(`${FROM} and p.common is not null order by p.common desc, p.id limit ${COMMON_CANDIDATES}`, [match]);
    for (const r of common) if (!seen.has(String(r.id))) rows.push(r);
  }
  return rows;
}

/** The contract's total ranking order. */
function rank(rows: readonly RankableRow[], tokens: readonly string[], popularity?: Popularity): RankableRow[] {
  const ranked = rows.map((r) => {
    const words = new Set(String(r.search_text).split(/[^\p{L}\p{N}]+/u));
    return {
      r,
      whole: tokens.filter((t) => words.has(t)).length,
      hasKcal: r.kcal === null ? 1 : 0,
      score: popularity?.get(String(r.id)) ?? NO_SCORE,
      common: Number(r.common ?? 0),
      len: String(r.search_text).length,
    };
  });
  ranked.sort(
    (a, b) =>
      b.whole - a.whole ||
      a.hasKcal - b.hasKcal ||
      b.score.mine - a.score.mine ||
      b.common - a.common ||
      comparePopularity(a.score, b.score) ||
      a.r._bm25 - b.r._bm25 ||
      a.len - b.len ||
      (String(a.r.id) < String(b.r.id) ? -1 : String(a.r.id) > String(b.r.id) ? 1 : 0),
  );
  return ranked.map((x) => x.r);
}

/**
 * The FTS vocabulary terms starting with `first`. The table is created in temp on first use,
 * so the read-only product file is never written and needs no change to its contents.
 */
function vocabulary(sql: Sql, first: string): VocabTerm[] {
  sql.run('create virtual table if not exists temp.products_vocab using fts5vocab(main, products_fts, row)');
  const next = String.fromCodePoint((first.codePointAt(0) as number) + 1);
  return sql.all<{ term: string; doc: number }>(
    'select term, doc from temp.products_vocab where term >= ? and term < ?',
    [first, next],
  ).map((r) => ({ term: r.term, docs: r.doc }));
}

/** Every FTS vocabulary term, read once per connection (fuzzy search needs words that contain the token). */
const fullVocabulary = new WeakMap<Sql, VocabTerm[]>();
function allVocabulary(sql: Sql): VocabTerm[] {
  let terms = fullVocabulary.get(sql);
  if (!terms) {
    sql.run('create virtual table if not exists temp.products_vocab using fts5vocab(main, products_fts, row)');
    terms = sql.all<{ term: string; doc: number }>('select term, doc from temp.products_vocab').map((r) => ({ term: r.term, docs: r.doc }));
    fullVocabulary.set(sql, terms);
  }
  return terms;
}

/** FTS5 MATCH text for step 7: the alternatives of a token joined by OR, the tokens by AND. */
function fuzzyMatch(groups: readonly (readonly Alternative[])[]): string {
  return groups
    .map((alts) => `(${alts.map((alt) => (alt.length === 1 ? matchTokens(alt) : `(${alt.map((a) => matchTokens([a])).join(' AND ')})`)).join(' OR ')})`)
    .join(' AND ');
}

/** How many products a token alone matches, capped at TYPO_MIN_MATCHES: more than that is never needed. */
function tokenMatches(sql: Sql, token: string): number {
  return (
    sql.get<{ n: number }>(
      `select count(*) as n from (select 1 from products_fts where products_fts match ? limit ${TYPO_MIN_MATCHES})`,
      [matchTokens([token])],
    )?.n ?? 0
  );
}

/** Search with the contract's query, typo correction and total ranking order. */
export function searchProducts(sql: Sql, query: string, limit = 20, popularity?: Popularity): Product[] {
  const tokens = tokenise(query);
  if (tokens.length === 0) return [];
  const rows = matchingRows(sql, matchTokens(tokens), popularity);
  const found = rank(rows, tokens, popularity);
  // A correction only adds rows after what the query really found, so nothing good is lost.
  const corrected = correctTokens(
    tokens,
    rows.length,
    (t) => tokenMatches(sql, t),
    (first) => vocabulary(sql, first),
  );
  if (corrected) {
    const seen = new Set(rows.map((r) => String(r.id)));
    const added = matchingRows(sql, matchTokens(corrected), popularity).filter((r) => !seen.has(String(r.id)));
    found.push(...rank(added, corrected, popularity));
  }
  if (found.length < TYPO_MIN_MATCHES) {
    // Step 7: split, contained and translated words, after everything the steps before found.
    const groups = fuzzyGroups(tokens, (t) => tokenMatches(sql, t), allVocabulary(sql));
    if (groups.some((g) => g.length > 1)) {
      const seen = new Set(found.map((r) => String(r.id)));
      const added = matchingRows(sql, fuzzyMatch(groups), popularity).filter((r) => !seen.has(String(r.id)));
      found.push(...rank(added, [...new Set(groups.flat(2))], popularity));
    }
  }
  return found.slice(0, limit).map(toProduct);
}

/** Verified products with a known kcal, best protein first, for the daily suggestions. Per-portion foods are left out:
 * their values are per portion, so they cannot be ranked against per-100 g foods (decision 42). */
export function verifiedProducts(sql: Sql, limit: number): Product[] {
  return sql
    .all<ProductRow>(`${SELECT} where p.verified = 1 and p.kcal is not null and p.per_100_unit <> 'portion' order by p.protein_g is null, p.protein_g desc, p.id limit ?`, [limit])
    .map(toProduct);
}

export type ProductLookup =
  | { status: 'found'; product: Product }
  | { status: 'redirected'; product: Product }
  | { status: 'removed' };

/** products.id, then redirects.old_id, then removed; an id found in none counts as removed. */
export function getProduct(sql: Sql, id: string): ProductLookup {
  const direct = sql.get<ProductRow>(`${SELECT} where p.id = ?`, [id]);
  if (direct) return { status: 'found', product: toProduct(direct) };
  const redirect = sql.get<{ new_id: string }>('select new_id from redirects where old_id = ?', [id]);
  if (redirect) {
    const target = sql.get<ProductRow>(`${SELECT} where p.id = ?`, [redirect.new_id]);
    if (target) return { status: 'redirected', product: toProduct(target) };
  }
  return { status: 'removed' };
}

/** The id and every old id that redirects to it (a merged flavour or listing), for reading old log entries. */
export function productAliases(sql: Sql, id: string): string[] {
  const old = sql.all<{ old_id: string }>('select old_id from redirects where new_id = ? order by old_id', [id]);
  return [id, ...old.map((r) => r.old_id)];
}

/** Canonicalise, then look up product_eans. null when not a barcode or not in the file. */
export function lookupBarcode(sql: Sql, raw: string): Product | null {
  const ean = canonicalEan(raw);
  if (ean === null) return null;
  const row = sql.get<ProductRow>(
    `${SELECT} where p.id = (select product_id from product_eans where ean = ?)`,
    [ean],
  );
  return row ? toProduct(row) : null;
}
