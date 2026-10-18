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

Deno.test("keeps unknown nutrition as null, not zero", () => {
  const r = validateMiss({ type: "photo_custom", query_text: "Skyr mango", custom_food: { name: "Skyr mango", per100: { kcal: 70, protein: 10 } } });
  assert(r.ok);
  const p = (r.row.custom_food as { per100: Record<string, number | null> }).per100;
  assertEquals(p.kcal, 70);
  assertEquals(p.fibre, null);
});

Deno.test("rejects out-of-range values and bad ids", () => {
  assert(!validateMiss({ type: "photo_custom", query_text: "x", custom_food: { name: "x", per100: { kcal: 5000 } } }).ok);
  assert(!validateMiss({ type: "scan_not_found", ean: "7038010000000", id: "not-a-uuid" }).ok);
});

Deno.test("rejects oversized text", () => {
  assert(!validateMiss({ type: "search_no_match", query_text: "x".repeat(201) }).ok);
});
