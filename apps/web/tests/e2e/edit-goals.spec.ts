// Editing About you and Goals after onboarding (#73): the Account rows, the limits, saving a new
// target, and a second save on the same day updating the row instead of adding one.
import { expect, test, type Page } from '@playwright/test';
import { inviteUser, pgRows, readOtp } from './local';

const SHOTS = process.env.SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

async function onboard(page: Page, email: string) {
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
  await expect(page.getByLabel('Daily calories')).toHaveValue('2800');
  await page.getByRole('button', { name: 'Start logging' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

const goalRows = (userId: string) =>
  pgRows<{ kcal_target: number; weight_kg: number | null; effective_from: string; deleted_at: string | null }>(
    `select kcal_target, weight_kg, effective_from, deleted_at from public.goals where user_id = '${userId}' order by created_at`,
  );

test('edit About you and Goals from Account: limits, new target, same-day update', async ({ page }) => {
  const email = `goals-${Date.now()}@example.test`;
  const userId = await inviteUser(email);
  await onboard(page, email);
  await expect.poll(() => goalRows(userId).length, { timeout: 15_000 }).toBe(1);

  await page.goto('/#/account');
  const about = page.getByRole('link', { name: /About you/ });
  const goals = page.getByRole('link', { name: /^Goals/ });
  await expect(about).toContainText('30 · 182 cm · 81.5 kg');
  await expect(goals).toContainText('2,800 kcal');
  await shot(page, '01-account');

  // Goals opens at the goals step; a low calorie target is blocked with a reason.
  await goals.click();
  await expect(page.getByRole('heading', { name: 'Your goals' })).toBeVisible();
  await shot(page, '02-goals');
  await page.getByLabel('Daily calories').fill('1000');
  await expect(page.getByText(/set goals under 1500 kcal/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await shot(page, '03-goals-blocked');

  // A valid new target: the macros follow the calories. Each share moves on its own, and Save waits for 100 (decision 40).
  await page.getByLabel('Daily calories').fill('2500');
  await page.getByLabel('Protein share').fill('35');
  await page.getByLabel('Carbs share').fill('45');
  await page.getByLabel('Fat share').fill('25');
  await expect(page.getByTestId('split-total')).toHaveText('105%');
  await expect(page.getByText('5% over. Make it 100% to save.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save' })).toBeDisabled();
  await shot(page, '03b-goals-split-over');
  await page.getByLabel('Carbs share').fill('40');
  await expect(page.getByTestId('split-total')).toHaveText('100%');
  await shot(page, '03c-goals-split');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await expect(goals).toContainText('2,500 kcal');
  await expect.poll(() => goalRows(userId).map((r) => r.kcal_target), { timeout: 15_000 }).toEqual([2500]);
  const saved = pgRows<{ protein_g_target: number; carbs_g_target: number; fat_g_target: number }>(
    `select protein_g_target, carbs_g_target, fat_g_target from public.goals where user_id = '${userId}' and deleted_at is null`,
  )[0];
  expect(saved.protein_g_target).toBe(219);
  expect(Math.abs(saved.protein_g_target * 4 + saved.carbs_g_target * 4 + saved.fat_g_target * 9 - 2500)).toBeLessThanOrEqual(10);

  // About you: change the weight, continue to goals, save the same day: still one live row.
  await about.click();
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible();
  await expect(page.getByLabel('Weight')).toHaveValue('81.5');
  await shot(page, '04-about');
  await page.getByLabel('Weight').fill('80');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Your goals' })).toBeVisible();
  await page.getByLabel('Daily calories').fill('2400');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(about).toContainText('80 kg');
  await expect(goals).toContainText('2,400 kcal');
  await expect.poll(() => goalRows(userId)[0]?.kcal_target, { timeout: 15_000 }).toBe(2400);
  const rows = goalRows(userId);
  expect(rows).toHaveLength(1);
  expect(rows[0].weight_kg).toBe(80);
  await shot(page, '05-account-after');
});
