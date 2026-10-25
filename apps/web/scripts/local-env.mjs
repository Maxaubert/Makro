// Writes apps/web/.env.development.local for the LOCAL Supabase stack (git-ignored).
//   npm run env:local     (needs `npx supabase@2.121.0 start` running from the repo root)
// Reads the local URL and anon key from `supabase status`; never the hosted project.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const repoRoot = new URL('../../../', import.meta.url);
const out = execSync('npx -y supabase@2.121.0 status -o env', { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const env = Object.fromEntries(
  out
    .split(/\r?\n/)
    .map((l) => /^([A-Z_]+)="?(.*?)"?$/.exec(l))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
if (!env.API_URL || !env.ANON_KEY) throw new Error('supabase status gave no API_URL or ANON_KEY. Is the local stack running?');
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(env.API_URL)) throw new Error(`refusing a non-local API_URL: ${env.API_URL}`);

writeFileSync(
  new URL('../.env.development.local', import.meta.url),
  [
    '# Local Supabase stack only. Written by scripts/local-env.mjs; git-ignored.',
    `VITE_SUPABASE_URL=${env.API_URL}`,
    `VITE_SUPABASE_ANON_KEY=${env.ANON_KEY}`,
    'VITE_PRODUCTS_SOURCE=fixture',
    '',
  ].join('\n'),
);
console.log(`wrote .env.development.local for ${env.API_URL}`);
