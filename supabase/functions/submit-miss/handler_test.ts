import { assertEquals } from "jsr:@std/assert@1";
import { type Deps, handle } from "./handler.ts";

const URL_ = "https://x.test/functions/v1/submit-miss";
const APP = "https://makro-steel.vercel.app";
const LOCAL = "http://localhost:5174";
const VALID = JSON.stringify({ type: "search_no_match", query_text: "skyr mango" });

const post = (body: string, headers: Record<string, string> = {}) => new Request(URL_, { method: "POST", headers, body });
const preflight = (origin: string) =>
  new Request(URL_, {
    method: "OPTIONS",
    headers: { origin, "access-control-request-method": "POST", "access-control-request-headers": "authorization,apikey,content-type,x-client-info" },
  });

function deps(rate: boolean | null = true, stored = true) {
  const ips: string[] = [];
  const rows: unknown[] = [];
  const d: Deps = {
    rateCheck: async (ip) => {
      ips.push(ip);
      return await Promise.resolve(rate);
    },
    insert: async (row) => {
      rows.push(row);
      return await Promise.resolve(stored);
    },
  };
  return { d, ips, rows };
}

const allowOrigin = (res: Response) => res.headers.get("access-control-allow-origin");

for (const origin of [APP, LOCAL]) {
  Deno.test(`answers the browser preflight for ${origin}`, async () => {
    const { d, ips, rows } = deps();
    const res = await handle(preflight(origin), d);
    assertEquals(res.status, 204);
    assertEquals(await res.text(), "");
    assertEquals(allowOrigin(res), origin);
    assertEquals(res.headers.get("vary"), "origin");
    assertEquals(res.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    // Every header supabase-js sends from the web app must be listed, or the browser blocks the POST.
    assertEquals(res.headers.get("access-control-allow-headers"), "authorization, apikey, content-type, x-client-info");
    assertEquals(ips, []);
    assertEquals(rows, []);
  });
}

Deno.test("does not allow the preflight for any other origin", async () => {
  for (const origin of ["https://evil.test", "https://makro-steel.vercel.app.evil.test", "http://localhost:5173", "null"]) {
    const { d, rows } = deps();
    const res = await handle(preflight(origin), d);
    assertEquals(allowOrigin(res), null, origin);
    assertEquals(res.headers.get("access-control-allow-headers"), null, origin);
    assertEquals(rows, []);
  }
});

Deno.test("a POST from the app origin stores the miss and carries the CORS header", async () => {
  const { d, rows } = deps();
  const res = await handle(post(VALID, { origin: APP }), d);
  assertEquals(res.status, 201);
  assertEquals(await res.json(), { ok: true });
  assertEquals(allowOrigin(res), APP);
  assertEquals(res.headers.get("content-type"), "application/json");
  assertEquals(rows.length, 1);
});

Deno.test("every refusal to the app origin carries the CORS header, so the client can read the status", async () => {
  const cases: [Request, ReturnType<typeof deps>, number][] = [
    [new Request(URL_, { headers: { origin: APP } }), deps(), 405],
    [post("x".repeat(8193), { origin: APP }), deps(), 413],
    [post("{", { origin: APP }), deps(), 400],
    [post(JSON.stringify({ type: "nope" }), { origin: APP }), deps(), 400],
    [post(VALID, { origin: APP }), deps(null), 500],
    [post(VALID, { origin: APP }), deps(false), 429],
    [post(VALID, { origin: APP }), deps(true, false), 500],
  ];
  for (const [req, { d }, status] of cases) {
    const res = await handle(req, d);
    assertEquals(res.status, status);
    assertEquals(allowOrigin(res), APP, `status ${status}`);
  }
});

Deno.test("a POST without an Origin (the phone app) still works and gets no CORS header", async () => {
  const { d, rows } = deps();
  const res = await handle(post(VALID), d);
  assertEquals(res.status, 201);
  assertEquals(allowOrigin(res), null);
  assertEquals(rows.length, 1);
});

Deno.test("a POST from another origin gets no CORS header", async () => {
  const { d } = deps();
  assertEquals(allowOrigin(await handle(post(VALID, { origin: "https://evil.test" }), d)), null);
});

Deno.test("only accepts POST", async () => {
  const { d, ips, rows } = deps();
  const res = await handle(new Request(URL_), d);
  assertEquals(res.status, 405);
  assertEquals(await res.json(), { error: "POST only" });
  assertEquals([ips, rows], [[], []]);
});

Deno.test("measures the body limit in bytes", async () => {
  const atLimit = deps();
  // Not too large, so it reaches JSON parsing and fails there instead.
  assertEquals((await handle(post("x".repeat(8192)), atLimit.d)).status, 400);
  const over = deps();
  const res = await handle(post("æ".repeat(4097)), over.d);
  assertEquals(res.status, 413);
  assertEquals(await res.json(), { error: "body too large" });
  assertEquals(over.rows, []);
});

Deno.test("refuses invalid JSON before any rate check", async () => {
  const { d, ips } = deps();
  const res = await handle(post("{"), d);
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: "invalid JSON" });
  assertEquals(ips, []);
});

Deno.test("refuses an invalid miss with the validator's message, before any rate check", async () => {
  const { d, ips, rows } = deps();
  const res = await handle(post(JSON.stringify({ type: "nope" })), d);
  assertEquals(res.status, 400);
  assertEquals(await res.json(), { error: "unknown type" });
  assertEquals([ips, rows], [[], []]);
});

Deno.test("rate-limits on the first forwarded address", async () => {
  const { d, ips } = deps();
  await handle(post(VALID, { "x-forwarded-for": " 203.0.113.9 , 10.0.0.1" }), d);
  assertEquals(ips, ["203.0.113.9"]);
});

Deno.test("rate-limits on 'unknown' when no address is forwarded", async () => {
  const { d, ips } = deps();
  await handle(post(VALID), d);
  assertEquals(ips, ["unknown"]);
});

Deno.test("over the limit: 429 and nothing stored", async () => {
  const { d, rows } = deps(false);
  const res = await handle(post(VALID), d);
  assertEquals(res.status, 429);
  assertEquals(await res.json(), { error: "too many requests" });
  assertEquals(rows, []);
});

Deno.test("a failed rate check: 500 and nothing stored", async () => {
  const { d, rows } = deps(null);
  const res = await handle(post(VALID), d);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "rate check failed" });
  assertEquals(rows, []);
});

Deno.test("a failed insert: 500", async () => {
  const { d } = deps(true, false);
  const res = await handle(post(VALID), d);
  assertEquals(res.status, 500);
  assertEquals(await res.json(), { error: "insert failed" });
});

Deno.test("stores the validated row, not the raw body", async () => {
  const { d, rows } = deps();
  await handle(post(JSON.stringify({ type: "search_no_match", query_text: " skyr ", user_id: "dropped" })), d);
  assertEquals(rows, [{
    type: "search_no_match",
    ean: null,
    query_text: "skyr",
    language: null,
    custom_food: null,
    db_version: null,
    product_id: null,
    country: null,
    app_version: null,
  }]);
});
