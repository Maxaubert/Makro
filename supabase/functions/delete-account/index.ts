// POST /functions/v1/delete-account: withdraw consent by deleting the caller's account and data (#15, #67).
import { createClient } from "npm:@supabase/supabase-js@2";
import { handle } from "./handler.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve((req) =>
  handle(req, {
    userIdFromToken: async (token) => {
      const { data, error } = await db.auth.getUser(token);
      return error ? null : data.user?.id ?? null;
    },
    deleteUser: async (id) => {
      const { error } = await db.auth.admin.deleteUser(id);
      if (error) console.error("delete failed", error.status); // no user data in logs
      return !error;
    },
  })
);
