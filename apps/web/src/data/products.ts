// Read-only access to products.sqlite, following packages/contracts/products-db.md v1.
// Nutrients are per 100 per_100_unit and null when unknown (never read as 0, rule 2).
// Every product carries its source and verified flag so the UI can show them (rule 4).
import { canonicalEan } from './barcode';
import { NUTRIENTS, type Nutrient } from '../domain/nutrients';
import { tokenise } from '../domain/normalise';
import type { Sql } from './sql';

/** Oldest product file schema this client reads (v1 of the contract is schema_version 2). */
export const MIN_SCHEMA_VERSION = 2;

export type Per100Unit = 'g' | 'ml';

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
  if (tokens.length === 0) return null;
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
    per_100_unit: r.per_100_unit === 'ml' ? 'ml' : 'g',
    source: String(r.source),
    source_name: (r.source_name as string | null) ?? String(r.source),
    source_kind: (r.source_kind as string | null) ?? null,
    verified: Number(r.verified) === 1,
    data_quality: dq,
    nutrients,
  };
}

/** Search with the contract's query and its total ranking order. */
export function searchProducts(sql: Sql, query: string, limit = 20): Product[] {
  const match = buildMatchQuery(query);
  if (match === null) return [];
  const tokens = tokenise(query);
  const rows = sql.all<ProductRow & { _bm25: number }>(
    `select p.*, s.display_name as source_name, s.kind as source_kind, bm25(products_fts) as _bm25
       from products_fts f join products p on p.rowid = f.rowid left join sources s on s.slug = p.source
      where products_fts match ?
      order by bm25(products_fts), length(p.search_text), p.id limit 500`,
    [match],
  );
  const ranked = rows.map((r) => {
    const words = new Set(String(r.search_text).split(/[^\p{L}\p{N}]+/u));
    return {
      r,
      whole: tokens.filter((t) => words.has(t)).length,
      hasKcal: r.kcal === null ? 1 : 0,
      len: String(r.search_text).length,
    };
  });
  ranked.sort(
    (a, b) =>
      b.whole - a.whole ||
      a.hasKcal - b.hasKcal ||
      a.r._bm25 - b.r._bm25 ||
      a.len - b.len ||
      (String(a.r.id) < String(b.r.id) ? -1 : String(a.r.id) > String(b.r.id) ? 1 : 0),
  );
  return ranked.slice(0, limit).map((x) => toProduct(x.r));
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
