// Deletes the caller's account. Every table references auth.users with on delete cascade, so the
// account's rows go with it. The user is taken from the verified token, never from the request.
export interface Deps {
  userIdFromToken: (token: string) => Promise<string | null>;
  deleteUser: (id: string) => Promise<boolean>;
}

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

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return json(401, { error: "not signed in" });

  const id = await deps.userIdFromToken(token);
  if (!id) return json(401, { error: "not signed in" });

  if (!(await deps.deleteUser(id))) return json(500, { error: "delete failed" });
  return json(200, { ok: true });
}
