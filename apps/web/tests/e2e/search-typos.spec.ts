// Typo correction in the real browser: the temp fts5vocab table on the OPFS-backed product file.
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { inviteUser, readOtp } from './local';

// Screenshots land here when SHOTS_DIR is set (reviews); otherwise they are skipped.
const SHOTS = process.env.SHOTS_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

test('a mistyped word still finds the food, a good query is untouched', async ({ page }) => {
  const shot = async (name: string) => {
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
  };
  const email = `typo-${Date.now()}@example.test`;
  await inviteUser(email);
  await page.goto('/');
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Email me a code' }).click();
  await page.getByLabel(/6-digit code/).fill(await readOtp(email));
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('checkbox', { name: /Store my weight/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Male', exact: true }).click();
  await page.getByLabel('Age').fill('30');
  await page.getByLabel('Height').fill('182');
  await page.getByLabel('Weight').fill('81,5');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start logging' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Search food' }).click();
  const box = page.getByRole('textbox', { name: 'Search foods' });
  const skyr = page.getByTestId('food-row').filter({ hasText: 'Skyr Naturell' });

  await box.fill('skyr');
  await expect(skyr).toBeVisible();
  await shot('exact');

  await box.fill('skry');
  await expect(skyr).toBeVisible();
  await shot('typo-skry');

  await box.fill('kjotdeig');
  await expect(page.getByTestId('food-row').filter({ hasText: /kj.ttdeig/i })).toBeVisible();

  await box.fill('qwertyuiop');
  await expect(page.getByTestId('food-row')).toHaveCount(0);
  await shot('nothing');
});
