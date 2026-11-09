// POST /functions/v1/submit-miss: anonymous, insert-only product miss (#13, #33).
// No user id is read or stored. The caller is hashed only to rate-limit.
import { createClient } from "npm:@supabase/supabase-js@2";
import { handle } from "./handler.ts";

const MAX_PER_HOUR = 60;

const url = Deno.env.get("SUPABASE_URL")!;
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, key, { auth: { persistSession: false } });

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve((req) =>
  handle(req, {
    rateCheck: async (ip) => {
      // Salted with the service key, so the hash cannot be reversed to an address.
      const bucket = await sha256(`${ip}|${key}`);
      const { data: allowed, error } = await db.rpc("miss_rate_check", { p_bucket: bucket, p_max: MAX_PER_HOUR });
      if (error) {
        console.error("rate check failed", error.code, error.message);
        return null;
      }
      return Boolean(allowed);
    },
    insert: async (row) => {
      // A client-supplied id makes offline retries idempotent: the same miss is stored once.
      const { error } = await db.from("misses").upsert(row, { onConflict: "id", ignoreDuplicates: true });
      if (error) console.error("insert failed", error.code, error.message); // no request data in logs
      return !error;
    },
  })
);
