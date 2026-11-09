// Request handling for submit-miss, apart from the database so it is tested without one.
// No user id is read or stored. The caller's address is passed on only to rate-limit.
import { type MissRow, validateMiss } from "./validate.ts";

export interface Deps {
  /** True when under the limit, false when over it, null when the check itself failed. */
  rateCheck: (ip: string) => Promise<boolean | null>;
  /** False when the insert failed. */
  insert: (row: MissRow) => Promise<boolean>;
}

const MAX_BODY_BYTES = 8192;

// Only browsers enforce this. The phone app sends no Origin and is unaffected (#72).
const ALLOWED_ORIGINS = new Set(["https://makro-steel.vercel.app", "http://localhost:5174"]);

function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  if (!ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "authorization, apikey, content-type, x-client-info",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "origin",
  };
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const headers = { "content-type": "application/json", ...cors(req) };
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  const allowed = await deps.rateCheck(ip);
  if (allowed === null) return json(500, { error: "rate check failed" });
  if (!allowed) return json(429, { error: "too many requests" });

  if (!(await deps.insert(v.row))) return json(500, { error: "insert failed" });
  return json(201, { ok: true });
}
