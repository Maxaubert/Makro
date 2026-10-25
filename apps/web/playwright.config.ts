import { defineConfig, devices } from '@playwright/test';

// Browser tests against the LOCAL Supabase stack (`npx supabase@2.121.0 start` from the repo
// root) and the fixture product file. The dev server gets the local URL and anon key from
// scripts/local-env.mjs. Nothing here talks to the hosted project.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  retries: 0,
  workers: 1,
  use: { baseURL: 'http://localhost:5174', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Pixel 7'] } }],
  webServer: {
    command: 'node scripts/local-env.mjs && npm run dev',
    url: 'http://localhost:5174',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
