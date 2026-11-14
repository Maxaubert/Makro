// Desktop Weight (board D_Weight) at 1440 px against the local stack: log from the side panel, ranges,
// stats, weigh-ins table with change, goal panel, edit and delete from a row, empty state.
import { devices, expect, test } from '@playwright/test';
import { pgRows } from './local';
import { desktopSignIn } from './desktop';

test.use({ ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } });

const pad = (n: number) => String(n).padStart(2, '0');
function daysAgoInput(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T07:40`;
}

test('desktop Weight: log, ranges, stats, table, goal, edit and delete', async ({ page }) => {
  const { userId } = await desktopSignIn(page, 'desktop-weight', '78');
  const serverWeights = () => pgRows<{ weight_kg: number; deleted_at: string | null }>(`select weight_kg, deleted_at from public.weight_entries where user_id = '${userId}' order by measured_at`);

  await page.getByRole('link', { name: 'Weight', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Weight', exact: true })).toBeVisible();

  // Onboarding's 81.5 is the only weigh-in: the latest value, goal card and "To goal" come from it.
  await expect(page.getByRole('button', { name: '30D' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('weight-change')).toContainText('Change, last 30 days');
  await expect(page.getByText('To goal', { exact: true }).locator('xpath=..')).toContainText('3.5 kg');
  const goal = page.getByRole('heading', { name: 'Goal' }).locator('xpath=..');
  await expect(goal).toContainText('78.0');
  await expect(goal).toContainText('Time to goal');

  // Log earlier days from the side panel: the stepper moves 0.1, the chip date picks the day.
  const panel = page.getByRole('heading', { name: 'Log weight' }).locator('xpath=../..');
  for (const [kg, days] of [['83,0', 28], ['82.4', 14], ['82.0', 7], ['81.8', 2]] as const) {
    await panel.getByLabel('Weight in kg').fill(kg);
    await panel.getByLabel('Date and time').fill(daysAgoInput(days));
    await panel.getByRole('button', { name: 'Save weight' }).click();
    await expect(panel.getByRole('button', { name: 'Saved' })).toBeVisible();
  }
  await panel.getByLabel('Weight in kg').fill('81.5');
  await panel.getByRole('button', { name: 'Minus 0.1 kg' }).click();
  await expect(panel.getByLabel('Weight in kg')).toHaveValue('81.4');
  await panel.getByLabel('Weight in kg').fill('20');
  await expect(panel.getByText('Enter a weight between 30 and 400 kg')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Save weight' })).toBeDisabled();
  await panel.getByLabel('Weight in kg').fill('81.4');

  // Stats and the table for the 30-day range, newest first, with the change from the weigh-in before.
  const list = page.getByRole('list', { name: 'Weigh-ins' });
  await expect(list.getByRole('link')).toHaveCount(5);
  await expect(page.getByText('Highest').locator('xpath=..')).toContainText('83.0 kg');
  await expect(page.getByText('Lowest').locator('xpath=..')).toContainText('81.5 kg');
  await expect(page.getByText('Weigh-ins', { exact: true }).locator('xpath=..').filter({ hasText: /^Weigh-ins5$/ })).toBeVisible();
  await expect(list.getByRole('link').first()).toContainText('81.5 kg');
  await expect(list.getByRole('link').first()).toContainText('-0.3');
  await expect(list.getByRole('link').first().getByRole('img', { name: 'Added by you' })).toBeVisible();

  // Ranges: 7D has the last two, 90D all five, and the heading follows.
  await page.getByRole('button', { name: '7D' }).click();
  await expect(page.getByTestId('weight-change')).toContainText('Change, last 7 days');
  await expect(list.getByRole('link')).toHaveCount(2);
  await page.getByRole('button', { name: '90D' }).click();
  await expect(page.getByTestId('weight-change')).toContainText('Change, last 90 days');
  await expect(page.getByRole('img', { name: /last|Weight over time/ })).toBeVisible();
  await expect(list.getByRole('link')).toHaveCount(5);

  // Edit the oldest row in the sheet, then delete it.
  await list.getByRole('link').last().click();
  const edit = page.getByRole('dialog', { name: 'Edit weight' });
  await expect(edit.getByLabel('Weight in kg')).toHaveValue('83.0');
  await edit.getByLabel('Weight in kg').fill('83.4');
  await edit.getByRole('button', { name: 'Save changes' }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByText('Highest').locator('xpath=..')).toContainText('83.4 kg');
  await expect.poll(async () => (await serverWeights()).map((w) => w.weight_kg), { timeout: 15_000 }).toContain(83.4);
  await list.getByRole('link').last().click();
  await page.getByRole('dialog', { name: 'Edit weight' }).getByRole('button', { name: 'Delete entry' }).click();
  await expect(list.getByRole('link')).toHaveCount(4);
  await expect.poll(async () => (await serverWeights()).filter((w) => w.deleted_at === null).length, { timeout: 15_000 }).toBe(4);

  // The Add food button in the header goes to the desktop Add food screen.
  await page.getByRole('link', { name: 'Add food' }).last().click();
  await expect(page.getByRole('heading', { name: 'Add food', exact: true })).toBeVisible();
  await page.goBack();

  // A wide window does not break it, and 390 px is the phone column.
  await page.setViewportSize({ width: 2200, height: 1100 });
  await expect(list.getByRole('link').first()).toBeVisible();
  expect(await page.locator('html').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator('.desktop-shell')).toHaveCount(0);
});
