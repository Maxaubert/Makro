// Voice and typed logging (decision 49) at 1440 px against the local stack and the fixture products:
// type a line, check what was found, an empty amount blocks logging, then log and see it on Today.
import { devices, expect, test } from '@playwright/test';
import { pgRows } from './local';
import { desktopSignIn } from './desktop';

test.use({ ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } });
const SHOTS = process.env.SHOTS_DIR;

test('voice: type a line, confirm the foods, log them', async ({ page }) => {
  const { userId } = await desktopSignIn(page, 'voice');
  await page.getByRole('link', { name: 'Add food', exact: true }).first().click();
  await page.getByRole('link', { name: 'Voice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Log by voice', exact: true })).toBeVisible();

  // No amount: Makro finds the food but never guesses an amount, so Log waits for one.
  await page.getByTestId('voice-text').fill('skyr');
  const row = page.getByTestId('voice-row');
  await expect(row).toHaveCount(1);
  await expect(row.getByRole('combobox', { name: 'Food for "skyr"' })).toContainText(/skyr/i);
  await expect(page.getByTestId('voice-log')).toBeDisabled();

  // With an amount the row is ready; a second food with no match offers a custom food (rule 5).
  await page.getByTestId('voice-text').fill('150 gram skyr og 2 qwxzv');
  await expect(row).toHaveCount(2);
  await expect(row.first().getByRole('textbox', { name: /^Amount of/ })).toHaveValue('150');
  await expect(row.nth(1)).toContainText('No match for qwxzv');
  await expect(row.nth(1).getByRole('link', { name: 'Make it a custom food' })).toBeVisible();
  await expect(page.getByTestId('voice-log')).toHaveText('Log 1 food');
  await expect(page.getByTestId('voice-log')).toBeEnabled();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/voice.png`, fullPage: true });

  await page.getByTestId('voice-log').click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByTestId('kcal-eaten')).toHaveText('93');
  await expect
    .poll(() => pgRows<{ quantity: number; unit: string }>(`select quantity, unit from public.log_entries where user_id = '${userId}'`).length, { timeout: 15_000 })
    .toBe(1);
});
