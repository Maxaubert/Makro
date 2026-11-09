// Today's guidance cards (#27, #53) in a real browser: the yesterday row, what is left with
// suggestions, and the weekly average. The clock is fixed so "this week" has earlier days.
import { expect, test, type Page } from '@playwright/test';
import { inviteUser, readOtp } from './local';

const SHOTS = process.env.SHOTS_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

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
  await page.getByRole('button', { name: 'Start logging' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

async function logSkyr(page: Page, grams: string) {
  await page.getByRole('link', { name: 'Search food' }).click();
  await page.getByRole('textbox', { name: 'Search foods' }).fill('skyr');
  await page.getByTestId('food-row').filter({ hasText: 'Skyr Naturell' }).click();
  await page.getByLabel('Amount').fill(grams);
  await page.getByRole('button', { name: /^Add to / }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

test('weekly average, what is left and the yesterday row', async ({ page }) => {
  const email = `guidance-${Date.now()}@example.test`;
  await inviteUser(email);
  await onboard(page, email);

  // Two logged days (the real day and a faked next day), then a third day with nothing logged.
  // The test needs a Monday-start week with at least two earlier days, so it fixes the clock to
  // a Wednesday, with the two logged days on the Monday and Tuesday before it.
  const day = (d: number) => new Date(2026, 10, d, 12, 0, 0); // November 2026: 9 is a Monday
  await page.clock.setFixedTime(day(9));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await logSkyr(page, '100');
  await page.clock.setFixedTime(day(10));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await logSkyr(page, '200');
  await page.clock.setFixedTime(day(11));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

  // Skyr: 11 g protein and 62 kcal per 100 g, so 11 g on day one and 22 g on day two, which averages 16.5 and shows as 17.
  const week = page.getByTestId('weekly-average');
  await expect(week).toContainText('17');
  await expect(page.getByTestId('weekly-coverage')).toContainText('Covers all 2 entries');
  await shot(page, 'today-wednesday');
  await page.getByRole('button', { name: 'Show Fibre' }).click();
  await expect(week).toContainText('?');
  await expect(page.getByTestId('weekly-verdict')).toHaveCount(0);
  await expect(page.getByTestId('weekly-coverage')).toContainText('Covers 0 of 2 entries');
  await shot(page, 'weekly-fibre-unknown');
  await page.getByRole('button', { name: 'Show Calories' }).click();
  await expect(week).toContainText('93');

  // Yesterday had a logged meal, so it gets a status line and the "may be incomplete" mark.
  await expect(page.getByTestId('yesterday-row')).toContainText('Under target');
  await expect(page.getByTestId('yesterday-row')).toContainText('incomplete');
  // Nothing eaten today: all of the goal is left, with ideas that fit.
  await expect(page.getByText('Fits what is left')).toBeVisible();
  await expect(page.getByText('From your history').first()).toBeVisible();

  // A suggestion opens the portion screen.
  await page.getByText('Verified product').first().click();
  await expect(page.getByLabel('Amount')).not.toHaveValue('');
  await shot(page, 'portion-from-suggestion');
});
