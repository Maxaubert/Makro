// Weight screen against the local stack: log (now and on earlier days), the 7-day trend, range
// chips, edit, delete, and the rows in Postgres. Canvas boards B_Weight and B_LogWeight.
import { expect, test, type Page } from '@playwright/test';
import { inviteUser, pgRows, readOtp } from './local';

const pad = (n: number) => String(n).padStart(2, '0');
function daysAgoInput(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(7, 40, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function signInAndOnboard(page: Page, email: string) {
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
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
}

async function logWeight(page: Page, kg: string, daysAgo = 0) {
  await page.getByRole('link', { name: 'Log weight' }).click();
  const sheet = page.getByRole('dialog', { name: 'Log weight' });
  await expect(sheet).toBeVisible();
  await sheet.getByLabel('Weight in kg').fill(kg);
  if (daysAgo > 0) await sheet.getByLabel('Date and time').fill(daysAgoInput(daysAgo));
  await sheet.getByRole('button', { name: 'Save weight' }).click();
  await expect(sheet).toBeHidden();
}

test('weight: log, trend, ranges, edit and delete', async ({ page }) => {
  const email = `weight-${Date.now()}@example.test`;
  const userId = await inviteUser(email);
  await signInAndOnboard(page, email);
  const serverWeights = () =>
    pgRows<{ weight_kg: number; deleted_at: string | null }>(`select weight_kg, deleted_at from public.weight_entries where user_id = '${userId}' order by measured_at`);

  // Onboarding saved 81.5 as the first weight of today.
  await page.getByRole('link', { name: 'Weight', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible();
  await expect(page.getByText('Latest')).toBeVisible();
  await expect(page.getByText('7-day trend needs 3 weigh-ins in a week')).toBeVisible();

  // Earlier days.
  await logWeight(page, '82,4', 6);
  await logWeight(page, '82.0', 4);
  await logWeight(page, '81.8', 2);
  await expect(page.getByRole('list', { name: 'Weights' }).getByRole('link')).toHaveCount(4);
  await expect(page.getByText(/^7-day trend \d+\.\d kg$/)).toBeVisible();

  // The sheet starts at the latest weight; the stepper moves by 0.1; implausible values block saving.
  await page.getByRole('link', { name: 'Log weight' }).click();
  const sheet = page.getByRole('dialog', { name: 'Log weight' });
  await expect(sheet.getByLabel('Weight in kg')).toHaveValue('81.5');
  await sheet.getByRole('button', { name: 'Minus 0.1 kg' }).click();
  await expect(sheet.getByLabel('Weight in kg')).toHaveValue('81.4');
  await sheet.getByLabel('Weight in kg').fill('20');
  await expect(sheet.getByText(/Enter a weight from/)).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Save weight' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Cancel' }).click();
  await expect(sheet).toBeHidden();

  // Stats and the range chips.
  await expect(page.getByText('Lowest').locator('xpath=..')).toContainText('81.5');
  await expect(page.getByText('Highest').locator('xpath=..')).toContainText('82.4');
  await page.getByRole('button', { name: '7D' }).click();
  await expect(page.getByRole('img', { name: /last 7 days/ })).toBeVisible();
  await page.getByRole('button', { name: '90D' }).click();
  await expect(page.getByRole('img', { name: /last 90 days/ })).toBeVisible();
  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.getByRole('img', { name: /Daily weight/ })).toBeVisible();

  // Edit the oldest entry (last in the list), then delete it.
  const rows = page.getByRole('list', { name: 'Weights' }).getByRole('link');
  await rows.last().click();
  const edit = page.getByRole('dialog', { name: 'Edit weight' });
  await expect(edit.getByLabel('Weight in kg')).toHaveValue('82.4');
  await edit.getByLabel('Weight in kg').fill('82.6');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText('Highest').locator('xpath=..')).toContainText('82.6');
  await expect.poll(async () => (await serverWeights()).map((w) => w.weight_kg), { timeout: 15_000 }).toContain(82.6);

  await rows.last().click();
  await page.getByRole('dialog', { name: 'Edit weight' }).getByRole('button', { name: 'Delete entry' }).click();
  await expect(rows).toHaveCount(3);
  await expect.poll(async () => (await serverWeights()).filter((w) => w.deleted_at === null).length, { timeout: 15_000 }).toBe(3);
});
