// Today's guidance cards (#27, #53) in a real browser: the yesterday row, what is left with
// suggestions, and the weekly average. The clock is fixed so "this week" has earlier days.
import { expect, test, type Page } from '@playwright/test';
import { inviteUser, pgRows, readOtp } from './local';

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

test('end of day: warning, add to that day, confirm complete, unlogged day', async ({ page }) => {
  const email = `dayend-${Date.now()}@example.test`;
  const uid = await inviteUser(email);
  // Sign up on Monday too: a goal starts the day it is set, so it must cover Monday.
  await page.clock.setFixedTime(new Date(2026, 10, 9, 12, 0, 0));
  await onboard(page, email);

  // One meal at noon on Monday, then look back at it from Tuesday.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await logSkyr(page, '100');
  await page.clock.setFixedTime(new Date(2026, 10, 10, 12, 0, 0));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

  await page.getByTestId('yesterday-row').click();
  await expect(page.getByRole('heading', { name: 'Mon 9 Nov' })).toBeVisible();
  await expect(page.getByTestId('day-end-status')).toHaveText('Under target');
  await expect(page.getByTestId('day-end-eaten')).toContainText('62 of');
  await expect(page.getByTestId('day-end-protein_g')).toContainText('11 g');
  const warning = page.getByTestId('day-end-warning');
  await expect(warning).toContainText('May be incomplete');
  await expect(page.getByTestId('day-end-reasons')).toHaveText(/Last 12:00\s*No dinner/);
  await expect(page.getByRole('img', { name: 'Nothing after 12:00' })).toBeVisible();
  await expect(warning).toContainText(/never counted as fasting/i);
  await shot(page, 'day-end-incomplete');

  // Adding from here lands on that day, as dinner, and comes back here.
  await page.getByRole('link', { name: 'Add food to Mon 9 Nov' }).click();
  await expect(page.getByTestId('adding-to-day')).toContainText('Mon 9 Nov');
  await expect(page.getByRole('link', { name: /barcode/ })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Search foods' }).fill('skyr');
  await page.getByTestId('food-row').filter({ hasText: 'Skyr Naturell' }).click();
  await expect(page.getByTestId('adding-to-day')).toContainText('Mon 9 Nov');
  await page.getByLabel('Amount').fill('100');
  await page.getByRole('button', { name: 'Add to Dinner' }).click();
  await expect(page.getByTestId('day-end-eaten')).toContainText('124 of');
  await expect(page.getByRole('img', { name: 'Only 2 entries logged' })).toBeVisible();

  // The entry syncs with the day it belongs to, and today stays empty.
  await expect
    .poll(() => pgRows<{ local_date: string }>(`select local_date from public.log_entries where user_id = '${uid}' and meal = 'dinner'`).map((r) => r.local_date.slice(0, 10)), { timeout: 15_000 })
    .toEqual(['2026-11-09']);

  // Confirming removes the warning here and on Today, and survives a reload.
  await page.getByRole('button', { name: 'Complete as logged' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  await expect(page.getByTestId('foods-logged')).toHaveText('0');
  await expect(page.getByTestId('yesterday-row')).toContainText('Under target');
  await expect(page.getByTestId('yesterday-incomplete')).toHaveCount(0);
  await page.reload();
  await page.getByTestId('yesterday-row').click();
  await expect(page.getByTestId('day-end-complete')).toHaveText('Complete as logged');
  await expect(warning).toHaveCount(0);
  await shot(page, 'day-end-confirmed');

  // A day with nothing logged has no status against the goal and is not a fast.
  await page.goto('/#/day-end/2026-11-08');
  await expect(page.getByRole('heading', { name: 'Sun 8 Nov' })).toBeVisible();
  await expect(page.getByTestId('day-end-status')).toHaveText('Nothing logged');
  await expect(page.getByText('never counted as fasting')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete as logged' })).toHaveCount(0);
  await expect(page.getByTestId('day-end-eaten')).toHaveCount(0);
  await shot(page, 'day-end-unlogged');
});

test('weekly average, what is left and the yesterday row', async ({ page }) => {
  const email = `guidance-${Date.now()}@example.test`;
  await inviteUser(email);

  // Two logged days, then a third day with nothing logged. The test needs a Monday-start week with
  // at least two earlier days, so it fixes the clock to a Wednesday, with the two logged days on the
  // Monday and Tuesday before it. The clock is set before onboarding, so the goal starts on the
  // Monday whatever the real date is (on 2026-11-12 it started after "yesterday", which then had no target).
  const day = (d: number) => new Date(2026, 10, d, 12, 0, 0); // November 2026: 9 is a Monday
  await page.clock.setFixedTime(day(9));
  await onboard(page, email);
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

  // Decision 47: 62 and 124 kcal are under half the calorie target, so both days look partly logged and are
  // left out on their own. Their striped bars stay; one tap on each counts it again.
  await expect(page.getByTestId('weekly-days')).toHaveText('0/2');
  await expect(page.getByTestId('ring-kcal')).toHaveText('?');
  const mon = page.getByTestId('week-day-2026-11-09');
  await expect(mon).toHaveAttribute('aria-pressed', 'false');
  await expect(mon).toHaveAttribute('aria-label', /looks partly logged, not counted\. Tap to count it\./);
  await shot(page, 'weekly-days-left-out');
  await mon.click();
  await expect(page.getByTestId('weekly-days')).toHaveText('1/2');
  await page.getByTestId('week-day-2026-11-10').click();
  await expect(page.getByTestId('weekly-days')).toHaveText('2/2');
  await expect(mon).toHaveAttribute('aria-pressed', 'true');
  // The choice stays after a reload.
  await page.reload();
  await expect(page.getByTestId('weekly-days')).toHaveText('2/2');

  // Skyr: 11 g protein and 62 kcal per 100 g, so 11 g on day one and 22 g on day two, which averages 16.5 and shows as 17.
  // The radar: every number is on screen, no hover or tap. Protein averages 17 g and calories 93 kcal.
  // Skyr has protein, carbs and fat in every entry and the goal has targets, so the shape is drawn.
  await expect(page.getByTestId('ring-kcal')).toHaveText('93');
  await expect(page.getByTestId('ring-kcal-bar')).toBeVisible();
  await expect(page.getByTestId('tile-protein')).toContainText('17');
  await expect(page.getByTestId('tile-carbs')).toContainText('6');
  await expect(page.getByTestId('macro-radar')).toBeVisible();
  await expect(page.getByTestId('radar-protein')).toContainText(/Protein\s*\d+%/);
  await expect(page.getByTestId('radar-missing')).toHaveCount(0);
  await shot(page, 'weekly-radar');
  const week = page.getByTestId('weekly-average');
  await expect(page.getByTestId('weekly-coverage')).toHaveCount(0);
  await expect(page.getByTestId('weekly-days')).toHaveText('2/2');
  await shot(page, 'today-wednesday');
  await page.getByRole('button', { name: 'Show Fibre' }).click();
  await expect(week).toContainText('?');
  await expect(page.getByTestId('weekly-verdict')).toHaveCount(0);
  await expect(page.getByTestId('weekly-coverage')).toHaveText('0/2');
  await expect(page.getByTestId('weekly-coverage')).toHaveAttribute('aria-label', /^Covers 0 of 2 entries/);
  await shot(page, 'weekly-fibre-unknown');
  await page.getByRole('button', { name: 'Show Calories' }).click();
  await expect(week).toHaveCount(0);

  // Yesterday had a logged meal, so it gets a status line and the "may be incomplete" mark.
  await expect(page.getByTestId('yesterday-row')).toContainText('Under target');
  await expect(page.getByTestId('yesterday-incomplete')).toBeVisible();
  // Nothing eaten today: all of the goal is left, with ideas that fit.
  await expect(page.getByText('Fits what is left')).toBeVisible();
  await expect(page.getByRole('img', { name: 'From your history' }).first()).toBeVisible();

  // A suggestion opens the portion screen.
  await page.getByTestId('suggestion-verified').first().click();
  await expect(page.getByLabel('Amount')).not.toHaveValue('');
  await shot(page, 'portion-from-suggestion');
});
