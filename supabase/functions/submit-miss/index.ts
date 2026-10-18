// POST /functions/v1/submit-miss: anonymous, insert-only product miss (#13, #33).
// No user id is read or stored. The caller is hashed only to rate-limit.
import { createClient } from "npm:@supabase/supabase-js@2";
import { validateMiss } from "./validate.ts";

const MAX_BODY_BYTES = 8192;
const MAX_PER_HOUR = 60;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const raw = await req.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return json(413, { error: "body too large" });

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: "invalid JSON" });
  }

  const v = validateMiss(body);
  if (!v.ok) return json(400, { error: v.error });

  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, key, { auth: { persistSession: false } });

  // Salted with the service key, so the hash cannot be reversed to an address.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const bucket = await sha256(`${ip}|${key}`);
  const { data: allowed, error: rateError } = await db.rpc("miss_rate_check", { p_bucket: bucket, p_max: MAX_PER_HOUR });
  if (rateError) {
    console.error("rate check failed", rateError.code, rateError.message);
    return json(500, { error: "rate check failed" });
  }
  if (!allowed) return json(429, { error: "too many requests" });

  // A client-supplied id makes offline retries idempotent: the same miss is stored once.
  const { error } = await db.from("misses").upsert(v.row, { onConflict: "id", ignoreDuplicates: true });
  if (error) {
    console.error("insert failed", error.code, error.message); // no request data in logs
    return json(500, { error: "insert failed" });
  }
  return json(201, { ok: true });
});
