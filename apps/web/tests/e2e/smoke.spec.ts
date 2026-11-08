// Smoke test against the local Supabase stack and the fixture product file (plan B5):
// sign in with the mailed code, search skyr, log 150 g, see the totals, go offline, log,
// come back online and find both rows in Postgres.
import { expect, test, type Page } from '@playwright/test';
import { inviteUser, pgRows, readOtp } from './local';

/** The user's rows straight from Postgres in the local db container (service_role has no grants on purpose). */
async function serverRows(userId: string) {
  return pgRows<{ grams: number; kcal_total: number | null; fibre_g_total: number | null; deleted_at: string | null }>(
    `select grams, kcal_total, fibre_g_total, deleted_at from public.log_entries where user_id = '${userId}' order by created_at`,
  );
}

async function logSkyr(page: Page, grams: string) {
  await page.getByRole('link', { name: 'Search food' }).click();
  await page.getByRole('textbox', { name: 'Search foods' }).fill('skyr');
  const row = page.getByTestId('food-row').filter({ hasText: 'Skyr Naturell' });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Verified');
  await row.click();
  await expect(page.getByTestId('portion-name')).toHaveText('Skyr Naturell');
  await page.getByLabel('Amount').fill(grams);
  await page.getByRole('button', { name: /^Add to / }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

test('sign in, log skyr, totals, offline logging and sync', async ({ page, context }) => {
  const email = `smoke-${Date.now()}@example.test`;
  const userId = await inviteUser(email);

  await page.goto('/');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByLabel(/6-digit code/).fill(await readOtp(email));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();

  // 150 g of skyr at 62 kcal per 100 g; fibre is unknown in the fixture, so it shows ?.
  await logSkyr(page, '150');
  await expect(page.getByTestId('kcal-eaten')).toHaveText('93');
  await expect(page.getByTestId('macro-protein_g')).toContainText('17 g');
  await expect(page.getByTestId('macro-fibre_g')).toContainText('? g');
  await expect(page.getByTestId('sync-status')).toHaveText('Synced', { timeout: 15_000 });
  await expect.poll(async () => (await serverRows(userId)).length, { timeout: 15_000 }).toBe(1);
  const [first] = await serverRows(userId);
  expect(first.kcal_total).toBeCloseTo(93);
  expect(first.fibre_g_total).toBeNull();

  // Offline: logging still works locally and waits in the outbox.
  await context.setOffline(true);
  await expect(page.getByTestId('sync-status')).toContainText('Offline');
  await logSkyr(page, '100');
  await expect(page.getByTestId('kcal-eaten')).toHaveText('155');
  await expect(page.getByTestId('sync-status')).toHaveText('Offline · 1 to sync');
  expect((await serverRows(userId)).length).toBe(1);

  // Back online: the outbox drains and the row is in Postgres.
  await context.setOffline(false);
  await expect(page.getByTestId('sync-status')).toHaveText('Synced', { timeout: 15_000 });
  await expect.poll(async () => (await serverRows(userId)).length, { timeout: 15_000 }).toBe(2);
  const rows = await serverRows(userId);
  expect(rows.map((r) => r.grams)).toEqual([150, 100]);
  expect(rows[1].kcal_total).toBeCloseTo(62);
});
