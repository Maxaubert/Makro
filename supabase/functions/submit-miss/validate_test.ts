import { assert, assertEquals } from "jsr:@std/assert@1";
import { validateMiss } from "./validate.ts";

Deno.test("accepts a barcode miss", () => {
  const r = validateMiss({ type: "scan_not_found", ean: "7038010000000", language: "nb", country: "NO", app_version: "0.1.0" });
  assert(r.ok);
  assertEquals(r.row.ean, "7038010000000");
});

Deno.test("accepts a voice miss with text only", () => {
  assert(validateMiss({ type: "voice_no_match", query_text: "  kjøttdeig  ", language: "nb" }).ok);
});

Deno.test("needs an ean or text", () => {
  assert(!validateMiss({ type: "search_no_match" }).ok);
});

Deno.test("rejects unknown type and bad ean", () => {
  assert(!validateMiss({ type: "nope", ean: "7038010000000" }).ok);
  assert(!validateMiss({ type: "scan_not_found", ean: "12ab" }).ok);
});

Deno.test("drops unknown keys, never keeps a user id", () => {
  const r = validateMiss({ type: "scan_not_found", ean: "7038010000000", user_id: "abc", email: "a@b.no" });
  assert(r.ok);
  assert(!("user_id" in r.row) && !("email" in r.row));
});

const per100Of = (r: ReturnType<typeof validateMiss>) =>
  (r.ok ? (r.row.custom_food as { per100: Record<string, number | null> }).per100 : {});

Deno.test("keeps unknown nutrition as null, not zero", () => {
  const r = validateMiss({ type: "photo_custom", query_text: "Skyr mango", custom_food: { name: "Skyr mango", per_100_unit: "g", per100: { kcal: 70, protein_g: 10 } } });
  assert(r.ok);
  const p = per100Of(r);
  assertEquals(p.kcal, 70);
  assertEquals(p.protein_g, 10);
  assertEquals(p.fibre_g, null);
});

Deno.test("takes the eight nutrient keys of log-schema v1 and per_100_unit", () => {
  const per100 = { kcal: 42, protein_g: 0, fat_g: 0, sat_fat_g: 0, carbs_g: 10.6, sugars_g: 10.6, fibre_g: 0, salt_g: 0.01 };
  const r = validateMiss({ type: "scan_not_found", ean: "5449000000996", custom_food: { name: "Cola", per_100_unit: "ml", per100 } });
  assert(r.ok);
  assertEquals(per100Of(r), per100);
  assertEquals((r.row.custom_food as Record<string, unknown>).per_100_unit, "ml");
});

Deno.test("rejects the old nutrient keys instead of dropping them", () => {
  const r = validateMiss({ type: "photo_custom", query_text: "x", custom_food: { name: "x", per_100_unit: "g", per100: { protein: 10 } } });
  assert(!r.ok);
  assert(r.error.includes("protein"));
});

Deno.test("rejects unknown nutrient keys", () => {
  assert(!validateMiss({ type: "photo_custom", query_text: "x", custom_food: { name: "x", per_100_unit: "g", per100: { iron_mg: 1 } } }).ok);
});

Deno.test("needs per_100_unit g or ml with a custom food", () => {
  assert(!validateMiss({ type: "photo_custom", query_text: "x", custom_food: { name: "x", per100: { kcal: 1 } } }).ok);
  assert(!validateMiss({ type: "photo_custom", query_text: "x", custom_food: { name: "x", per_100_unit: "dl", per100: { kcal: 1 } } }).ok);
});

Deno.test("accepts product ids longer than 40 characters", () => {
  const id = "bodypower:https://www.bodypower.se/kosttillskott-1/protein/isolat/myprotein-clear-whey-isolate-orange-mango-500g";
  const r = validateMiss({ type: "wrong_value", ean: "7038010000000", product_id: id });
  assert(r.ok);
  assertEquals(r.row.product_id, id);
  assert(!validateMiss({ type: "wrong_value", ean: "7038010000000", product_id: "x".repeat(1025) }).ok);
});

Deno.test("rejects out-of-range values and bad ids", () => {
  assert(!validateMiss({ type: "photo_custom", query_text: "x", custom_food: { name: "x", per_100_unit: "g", per100: { kcal: 5000 } } }).ok);
  assert(!validateMiss({ type: "scan_not_found", ean: "7038010000000", id: "not-a-uuid" }).ok);
});

Deno.test("rejects oversized text", () => {
  assert(!validateMiss({ type: "search_no_match", query_text: "x".repeat(201) }).ok);
});
