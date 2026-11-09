import { assertEquals } from "jsr:@std/assert@1";
import { handle, type Deps } from "./handler.ts";

const URL_ = "https://x.test/functions/v1/delete-account";
const post = (headers: Record<string, string> = {}) => new Request(URL_, { method: "POST", headers });

function deps(user: string | null, ok = true) {
  const deleted: string[] = [];
  const d: Deps = {
    userIdFromToken: async () => await Promise.resolve(user),
    deleteUser: async (id) => {
      deleted.push(id);
      return await Promise.resolve(ok);
    },
  };
  return { d, deleted };
}

Deno.test("deletes the account the token belongs to", async () => {
  const { d, deleted } = deps("user-1");
  const res = await handle(post({ authorization: "Bearer abc" }), d);
  assertEquals(res.status, 200);
  assertEquals(deleted, ["user-1"]);
});

Deno.test("refuses a request with no token", async () => {
  const { d, deleted } = deps("user-1");
  assertEquals((await handle(post(), d)).status, 401);
  assertEquals(deleted, []);
});

Deno.test("refuses a token that is not valid", async () => {
  const { d, deleted } = deps(null);
  assertEquals((await handle(post({ authorization: "Bearer bad" }), d)).status, 401);
  assertEquals(deleted, []);
});

Deno.test("only accepts POST", async () => {
  const { d, deleted } = deps("user-1");
  assertEquals((await handle(new Request(URL_, { headers: { authorization: "Bearer abc" } }), d)).status, 405);
  assertEquals(deleted, []);
});

Deno.test("reports a failed delete", async () => {
  const { d } = deps("user-1", false);
  assertEquals((await handle(post({ authorization: "Bearer abc" }), d)).status, 500);
});

Deno.test("answers the browser preflight for the app's origin only", async () => {
  const { d, deleted } = deps("user-1");
  const ok = await handle(new Request(URL_, { method: "OPTIONS", headers: { origin: "https://makro-steel.vercel.app" } }), d);
  assertEquals(ok.status, 204);
  assertEquals(ok.headers.get("access-control-allow-origin"), "https://makro-steel.vercel.app");
  const other = await handle(new Request(URL_, { method: "OPTIONS", headers: { origin: "https://evil.test" } }), d);
  assertEquals(other.headers.get("access-control-allow-origin"), null);
  assertEquals(deleted, []);
});
