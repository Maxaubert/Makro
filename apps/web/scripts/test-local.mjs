// Runs the sync integration test against the LOCAL Supabase stack.
//   npm run test:local     (needs `npx supabase@2.121.0 start` and `db reset` from the repo root)
// Keys come from `supabase status` and live only in this process's environment.
import { execSync, spawnSync } from 'node:child_process';

const repoRoot = new URL('../../../', import.meta.url);
const out = execSync('npx -y supabase@2.121.0 status -o env', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const env = Object.fromEntries(
  out
    .split(/\r?\n/)
    .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.API_URL ?? '')) throw new Error(`not a local stack: ${env.API_URL}`);

const r = spawnSync('npx', ['vitest', 'run', 'src/data/sync.integration.test.ts'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: {
    ...process.env,
    MAKRO_LOCAL_SUPABASE: '1',
    SUPABASE_URL: env.API_URL,
    SUPABASE_ANON_KEY: env.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SERVICE_ROLE_KEY,
  },
});
process.exit(r.status ?? 1);
