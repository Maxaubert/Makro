// Desktop sign-in, Today and Diary at 1440 px (boards D_SignIn, D_Today, D_Diary), local stack.
import { devices, expect, test } from '@playwright/test';
import { inviteUser, readOtp } from './local';

test.use({ ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } });

test('desktop: sign in, log a food, Today and Diary follow the boards', async ({ page }) => {
  const email = `desktop-${Date.now()}@example.test`;
  await inviteUser(email);

  // D_SignIn: the action is orange from the start (dimmed while disabled).
  await page.goto('/');
  const send = page.getByRole('button', { name: 'Email me a code' });
  await expect(send).toBeDisabled();
  await expect(send).toHaveCSS('background-color', 'rgb(255, 76, 0)');
  await page.getByLabel('Email address').fill(email);
  await send.click();
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

  // D_Today, empty day: goal, empty table, figures use the board's default (not tabular) digits.
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByText('Goal 2,800 kcal').first()).toBeVisible();
  await expect(page.getByTestId('kcal-headline')).toHaveText('2,800');
  // Empty: no rows and no explanation, just the action; Quick log stays hidden until a food is logged.
  await expect(page.getByTestId('today-entry')).toHaveCount(0);
  await expect(page.getByTestId('quick-log-row')).toHaveCount(0);
  expect((await page.getByRole('heading', { name: 'Today', exact: true }).boundingBox())?.x).toBe(272);
  await expect(page.getByTestId('kcal-eaten')).toHaveCSS('font-variant-numeric', 'normal');

  // Log 150 g of skyr (62 kcal per 100 g) from the desktop Add food screen.
  await page.getByRole('link', { name: 'Add food', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Search foods' }).fill('skyr');
  await page.getByTestId('food-row').filter({ hasText: 'Skyr Naturell' }).click();
  await page.getByLabel('Amount').fill('150');
  await page.getByRole('button', { name: /^Add to / }).click();

  await page.goto('/#/today');
  await expect(page.getByTestId('kcal-eaten')).toHaveText('93');
  await expect(page.getByTestId('kcal-headline')).toHaveText('2,707');
  await expect(page.getByTestId('foods-logged')).toHaveText('1');
  const entry = page.getByTestId('today-entry');
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText('Skyr Naturell');
  await expect(entry).toContainText('150 g');
  // A verified food shows only the seal; its label names the source (decision 46).
  await expect(page.getByTestId('quick-log-row').first().getByTestId('source-badge')).toHaveAttribute('aria-label', /^Verified/);
  await page.getByRole('button', { name: '7D' }).click();
  await expect(page.getByRole('button', { name: '7D' })).toHaveAttribute('aria-pressed', 'true');
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/desktop-today.png` });

  // D_Diary: pick the entry, change the amount, and the day total follows.
  await page.getByRole('link', { name: 'Open diary' }).click();
  await expect(page.getByRole('heading', { name: 'Diary', exact: true })).toBeVisible();
  await expect(page.getByTestId('diary-day')).toHaveCount(7);
  await expect(page.getByTestId('kcal-eaten')).toHaveText('93');
  await page.getByTestId('diary-entry').click();
  await expect(page.getByTestId('diary-edit').getByRole('button', { name: /^Verified/ })).toBeVisible();
  await page.getByTestId('diary-edit').getByLabel('Amount in g').fill('200');
  await expect(page.getByTestId('kcal-eaten')).toHaveText('124');
  await page.getByTestId('diary-edit').getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByTestId('kcal-eaten')).toHaveText('93');
  await page.getByTestId('diary-entry').click();
  await page.getByTestId('diary-edit').getByLabel('Amount in g').fill('200');
  await page.getByTestId('diary-edit').getByRole('button', { name: 'Done' }).click();
  await expect(page.getByTestId('kcal-eaten')).toHaveText('124');
  await expect(page.getByTestId('diary-edit')).toHaveCount(0);

  // The weekly panel switches measure and keeps unknown as "?".
  await page.getByRole('button', { name: 'Protein' }).first().click();
  await page.getByRole('option', { name: 'Calories' }).click();
  await expect(page.getByTestId('weekly-average')).toHaveCount(0);
  await expect(page.getByTestId('ring-kcal')).toHaveText('?');

  // A wide window does not break the layout, and 390 px is still the phone column.
  await page.setViewportSize({ width: 2200, height: 1100 });
  await expect(page.getByTestId('diary-entry')).toBeVisible();
  expect(await page.locator('html').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator('.desktop-shell')).toHaveCount(0);
});
