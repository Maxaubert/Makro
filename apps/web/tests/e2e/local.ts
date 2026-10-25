// Helpers for the smoke test: the LOCAL Supabase stack (keys from `supabase status`) and its
// Mailpit inbox, where the one-time codes land. Never the hosted project.
import { execSync } from 'node:child_process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface LocalStack {
  apiUrl: string;
  anonKey: string;
  serviceKey: string;
  mailpitUrl: string;
}

let cached: LocalStack | null = null;

export function localStack(): LocalStack {
  if (cached) return cached;
  const out = execSync('npx -y supabase@2.121.0 status -o env', {
    cwd: new URL('../../../../', import.meta.url),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  const env = Object.fromEntries(
    out
      .split(/\r?\n/)
      .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => [m[1], m[2]]),
  );
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.API_URL ?? '')) throw new Error(`not a local stack: ${env.API_URL}`);
  cached = {
    apiUrl: env.API_URL,
    anonKey: env.ANON_KEY,
    serviceKey: env.SERVICE_ROLE_KEY,
    mailpitUrl: env.MAILPIT_URL ?? env.INBUCKET_URL ?? 'http://127.0.0.1:54324',
  };
  return cached;
}

export function admin(): SupabaseClient {
  const s = localStack();
  return createClient(s.apiUrl, s.serviceKey, { auth: { persistSession: false } });
}

/** An invited user (sign-up is off, so the test creates the account like Max would). */
export async function inviteUser(email: string): Promise<string> {
  const { data, error } = await admin().auth.admin.createUser({ email, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('no user');
  return data.user.id;
}

/**
 * The 6-digit code for `email`. Waits for the sign-in mail in Mailpit (so the app really asked
 * Auth to send one) and reads the code from it. The CLI's default local template carries only a
 * link, and a custom template cannot be mounted on Windows Docker Desktop (the same copy bug as
 * the edge runtime), so when the mail has no code a fresh one is issued with the admin API
 * (generateLink returns email_otp; it replaces the mailed one).
 */
export async function readOtp(email: string, timeoutMs = 20_000): Promise<string> {
  const { mailpitUrl } = localStack();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${mailpitUrl}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    if (res.ok) {
      const list = (await res.json()) as { messages?: { ID: string }[] };
      const id = list.messages?.[0]?.ID;
      if (id) {
        const msg = (await (await fetch(`${mailpitUrl}/api/v1/message/${id}`)).json()) as { Text?: string; HTML?: string };
        const m = /\b(\d{6})\b/.exec(`${msg.Text ?? ''} ${msg.HTML ?? ''}`);
        if (m) return m[1];
        const { data, error } = await admin().auth.admin.generateLink({ type: 'magiclink', email });
        if (error || !data.properties?.email_otp) throw error ?? new Error('generateLink gave no email_otp');
        return data.properties.email_otp;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`no sign-in mail reached Mailpit for ${email}`);
}

/** Rows from the local Postgres container as JSON. Only for fixed test SQL with checked ids. */
export function pgRows<T>(sql: string): T[] {
  if (/user_id = '(?![0-9a-f-]{36}')/.test(sql)) throw new Error('pgRows: user_id must be a uuid');
  const out = execSync('docker exec -i supabase_db_Makro psql -U postgres -q -X -t -A', {
    input: `select coalesce(json_agg(t), '[]') from (${sql}) t;`,
    encoding: 'utf8',
  });
  return JSON.parse(out.trim()) as T[];
}
