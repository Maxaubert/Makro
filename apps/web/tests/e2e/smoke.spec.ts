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
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

test('sign in, log skyr, totals, offline logging and sync', async ({ page, context }) => {
  const email = `smoke-${Date.now()}@example.test`;
  const userId = await inviteUser(email);

  await page.goto('/');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByLabel(/6-digit code/).fill(await readOtp(email));
  await page.getByRole('button', { name: 'Sign in' }).click();

  // First run: consent is required, then about you, then goals calculated by code.
  await page.getByRole('button', { name: 'Get started' }).click();
  const proceed = page.getByRole('button', { name: 'Continue' });
  await expect(proceed).toBeDisabled();
  await page.getByRole('checkbox', { name: /Store my weight/ }).click();
  await proceed.click();
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await page.getByLabel('Age').fill('30');
  await page.getByLabel('Height').fill('182');
  await page.getByLabel('Weight').fill('81,5');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Daily calories')).toHaveValue('2800');
  await page.getByLabel('Daily calories').fill('1000');
  await expect(page.getByRole('button', { name: 'Start logging' })).toBeDisabled();
  await page.getByLabel('Daily calories').fill('2800');
  await page.getByRole('button', { name: 'Start logging' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('Goal 2,800 kcal')).toBeVisible();
  await expect.poll(() => pgRows<{ kcal_target: number }>(`select kcal_target from public.goals where user_id = '${userId}'`).length, { timeout: 15_000 }).toBe(1);
  expect(pgRows<{ kind: string }>(`select kind from public.consents where user_id = '${userId}'`).map((r) => r.kind)).toEqual(['health_data']);

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
  // The search screen lists recent foods before you type, and the amount starts at last time's.
  await page.getByRole('link', { name: 'Search food' }).click();
  await page.getByTestId('food-row').filter({ hasText: 'Skyr Naturell' }).click();
  await expect(page.getByLabel('Amount')).toHaveValue('150');
  await page.goBack();
  await page.goBack();
  await logSkyr(page, '100');
  await expect(page.getByTestId('kcal-eaten')).toHaveText('155');
  await expect(page.getByTestId('foods-logged')).toHaveText('2');
  await expect(page.getByTestId('sync-status')).toHaveText('Offline · 1 to sync');
  expect((await serverRows(userId)).length).toBe(1);

  // Back online: the outbox drains and the row is in Postgres.
  await context.setOffline(false);
  await expect(page.getByTestId('sync-status')).toHaveText('Synced', { timeout: 15_000 });
  await expect.poll(async () => (await serverRows(userId)).length, { timeout: 15_000 }).toBe(2);
  const rows = await serverRows(userId);
  expect(rows.map((r) => r.grams)).toEqual([150, 100]);
  expect(rows[1].kcal_total).toBeCloseTo(62);

  // Your data: opt in to popularity, download, then withdraw by deleting the account.
  await page.goto('/#/account');
  const popular = page.getByRole('switch', { name: 'Count toward popular foods' });
  await expect(popular).toBeEnabled();
  await expect(popular).toHaveAttribute('aria-checked', 'false');
  await popular.click();
  await expect(popular).toHaveAttribute('aria-checked', 'true');
  expect(pgRows(`select 1 from public.consents where user_id = '${userId}' and kind = 'popularity' and withdrawn_at is null`)).toHaveLength(1);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  expect((await download).suggestedFilename()).toBe('makro-data.json');
  // The edge runtime cannot run locally on Windows Docker; the function has its own Deno tests.
  await page.route('**/functions/v1/delete-account', (r) => r.fulfill({ status: 200, json: { ok: true } }));
  await page.getByRole('button', { name: 'Withdraw consent and delete my data' }).click();
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByLabel('Email address')).toBeVisible();
});
