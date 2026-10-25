// Validation for submit-miss. Pure, so it is unit-tested without a database.
// Unknown top-level keys are dropped, never stored. There is no user id field on purpose (#13).
// custom_food uses the nutrient keys of packages/contracts/log-schema.md (v1); unknown or old
// nutrient keys are an error, so a client on the old payload fails loudly instead of losing data.

export const MISS_TYPES = [
  "scan_not_found",
  "search_no_match",
  "voice_no_match",
  "photo_custom",
  "wrong_value",
] as const;

export type MissRow = {
  id?: string;
  type: (typeof MISS_TYPES)[number];
  ean: string | null;
  query_text: string | null;
  language: string | null;
  custom_food: Record<string, unknown> | null;
  db_version: string | null;
  product_id: string | null;
  country: string | null;
  app_version: string | null;
};

export type Result = { ok: true; row: MissRow } | { ok: false; error: string };

// Per 100 g or ml. Upper bounds only catch typos; null means unknown, never zero.
const NUTRIENT_LIMITS: Record<string, number> = {
  kcal: 900, protein_g: 100, fat_g: 100, sat_fat_g: 100, carbs_g: 100, sugars_g: 100, fibre_g: 100, salt_g: 100,
};
// Product ids are unbounded in the contract (longest today: 184). The cap only stops abuse.
const PRODUCT_ID_MAX = 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(v: unknown, max: number, field: string): string | null | Error {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return new Error(`${field} must be a string`);
  const t = v.trim();
  if (t.length === 0) return null;
  if (t.length > max) return new Error(`${field} is too long`);
  return t;
}

function num(v: unknown, max: number): number | null | Error {
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > max) {
    return new Error("number out of range");
  }
  return v;
}

function customFood(v: unknown): Record<string, unknown> | null | Error {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) return new Error("custom_food must be an object");
  const o = v as Record<string, unknown>;
  const name = text(o.name, 100, "custom_food.name");
  if (name instanceof Error) return name;
  if (name === null) return new Error("custom_food.name is required");
  const brand = text(o.brand, 100, "custom_food.brand");
  if (brand instanceof Error) return brand;
  if (o.per_100_unit !== "g" && o.per_100_unit !== "ml") return new Error("custom_food.per_100_unit must be g or ml");
  const out: Record<string, unknown> = { name, brand, per_100_unit: o.per_100_unit };
  const per100 = (o.per100 ?? {}) as Record<string, unknown>;
  if (typeof per100 !== "object" || per100 === null || Array.isArray(per100)) return new Error("custom_food.per100 must be an object");
  const unknown = Object.keys(per100).filter((k) => !(k in NUTRIENT_LIMITS));
  if (unknown.length) return new Error(`custom_food.per100 has unknown keys: ${unknown.join(", ")} (use ${Object.keys(NUTRIENT_LIMITS).join(", ")})`);
  const p: Record<string, number | null> = {};
  for (const [k, max] of Object.entries(NUTRIENT_LIMITS)) {
    const n = num(per100[k], max);
    if (n instanceof Error) return new Error(`custom_food.per100.${k} out of range`);
    p[k] = n; // null means unknown, never zero
  }
  out.per100 = p;
  const serving = num(o.serving_g, 5000);
  if (serving instanceof Error) return new Error("custom_food.serving_g out of range");
  out.serving_g = serving;
  return out;
}

export function validateMiss(body: unknown): Result {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "body must be a JSON object" };
  }
  const b = body as Record<string, unknown>;

  if (!MISS_TYPES.includes(b.type as MissRow["type"])) return { ok: false, error: "unknown type" };

  const ean = text(b.ean, 14, "ean");
  if (ean instanceof Error) return { ok: false, error: ean.message };
  if (ean !== null && !/^[0-9]{8,14}$/.test(ean)) return { ok: false, error: "ean must be 8 to 14 digits" };

  const query_text = text(b.query_text, 200, "query_text");
  if (query_text instanceof Error) return { ok: false, error: query_text.message };
  if (ean === null && query_text === null) return { ok: false, error: "ean or query_text is required" };

  const language = text(b.language, 8, "language");
  if (language instanceof Error) return { ok: false, error: language.message };
  if (language !== null && !/^[a-z]{2}(-[A-Za-z]{2})?$/.test(language)) return { ok: false, error: "bad language" };

  const country = text(b.country, 2, "country");
  if (country instanceof Error) return { ok: false, error: country.message };
  if (country !== null && !/^[A-Z]{2}$/.test(country)) return { ok: false, error: "bad country" };

  const db_version = text(b.db_version, 40, "db_version");
  if (db_version instanceof Error) return { ok: false, error: db_version.message };
  const product_id = text(b.product_id, PRODUCT_ID_MAX, "product_id");
  if (product_id instanceof Error) return { ok: false, error: product_id.message };
  const app_version = text(b.app_version, 20, "app_version");
  if (app_version instanceof Error) return { ok: false, error: app_version.message };

  const cf = customFood(b.custom_food);
  if (cf instanceof Error) return { ok: false, error: cf.message };

  let id: string | undefined;
  if (b.id !== undefined) {
    if (typeof b.id !== "string" || !UUID.test(b.id)) return { ok: false, error: "id must be a UUID" };
    id = b.id;
  }

  return {
    ok: true,
    row: { ...(id ? { id } : {}), type: b.type as MissRow["type"], ean, query_text, language, custom_food: cf, db_version, product_id, country, app_version },
  };
}
