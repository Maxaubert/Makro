// Fast repeat on the web (slice 5, #25): favourites from the portion screen, saving a diary meal,
// logging it in one tap and repeating yesterday. Each path must write ordinary log_entries rows
// that sync to Postgres. Runs against the local stack and the fixture product file.
// Set SHOTS=<folder> to also write screenshots there.
import { expect, test, type Page } from '@playwright/test';
import { inviteUser, pgRows, readOtp } from './local';

const SHOTS = process.env.SHOTS;
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
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
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

async function logFood(page: Page, query: string, name: string, grams: string, meal: string) {
  await page.goto('/#/add');
  await page.getByRole('textbox', { name: 'Search foods' }).fill(query);
  await page.getByTestId('food-row').filter({ hasText: name }).click();
  await expect(page.getByTestId('portion-name')).toHaveText(name);
  await page.getByLabel('Amount').fill(grams);
  await page.getByRole('button', { name: meal, exact: true }).click();
  await page.getByRole('button', { name: /^Add to / }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
}

type Row = { meal: string; grams: number; kcal_total: number | null; source: string; name: string };
const serverRows = (userId: string) =>
  pgRows<Row>(`select meal, grams, kcal_total, source, name from public.log_entries where user_id = '${userId}' and deleted_at is null order by created_at, id`);

test('favourites, saved meals and repeat yesterday write normal log entries', async ({ page }) => {
  const email = `fast-${Date.now()}@example.test`;
  const userId = await inviteUser(email);

  const at = (daysAgo: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  await page.clock.install({ time: at(1, 8) });
  await signInAndOnboard(page, email);

  // Yesterday: skyr for breakfast, a banana for lunch.
  await logFood(page, 'skyr', 'Skyr Naturell', '150', 'Breakfast');
  await logFood(page, 'banan', 'Banan', '118', 'Lunch');
  await expect.poll(async () => (await serverRows(userId)).length, { timeout: 15_000 }).toBe(2);

  // Favourites: the heart on the portion screen, then the Favourites tab.
  await page.goto('/#/add');
  await page.getByRole('textbox', { name: 'Search foods' }).fill('skyr');
  await page.getByTestId('food-row').filter({ hasText: 'Skyr Naturell' }).click();
  const heart = page.getByRole('button', { name: 'Favourite' });
  await expect(heart).toHaveAttribute('aria-pressed', 'false');
  await heart.click();
  await expect(heart).toHaveAttribute('aria-pressed', 'true');
  await shot(page, '01-portion-favourite');
  await page.goto('/#/add');
  await page.getByRole('button', { name: 'Favourites' }).click();
  await expect(page.getByTestId('food-row')).toHaveCount(1);
  await expect(page.getByTestId('food-row')).toContainText('Skyr Naturell');
  await expect(page.getByTestId('food-row').getByTestId('source-badge')).toHaveAttribute('aria-label', /^Verified/);
  await shot(page, '02-favourites-tab');
  await page.getByTestId('food-row').click();
  await expect(page.getByTestId('portion-name')).toHaveText('Skyr Naturell');
  await page.getByRole('button', { name: 'Favourite' }).click(); // un-favourite
  await expect(page.getByRole('button', { name: 'Favourite' })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Favourite' }).click(); // and back
  await expect(page.getByRole('button', { name: 'Favourite' })).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => pgRows(`select 1 from public.favourites where user_id = '${userId}' and deleted_at is null`).length, { timeout: 15_000 }).toBe(1);

  // Today: repeat yesterday's breakfast only (the meal of the moment starts ticked).
  await page.clock.setFixedTime(at(0, 8));
  await page.goto('/#/diary');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Diary' })).toBeVisible();
  await expect(page.getByTestId('diary-entry')).toHaveCount(0);
  await shot(page, '03-diary-empty-with-repeat');
  await page.getByRole('button', { name: 'Repeat yesterday' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('button', { name: /Breakfast/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.getByRole('button', { name: /Lunch/ })).toHaveAttribute('aria-pressed', 'false');
  await shot(page, '04-repeat-sheet');
  await sheet.getByRole('button', { name: 'Add to today' }).click();
  await expect(page.getByTestId('diary-entry')).toHaveCount(1);
  await expect(page.getByTestId('diary-entry')).toContainText('Skyr Naturell');
  await shot(page, '05-diary-after-repeat');
  // Nothing left to repeat for that meal, but lunch is still offered.
  await page.getByRole('button', { name: 'Repeat yesterday' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: /Breakfast/ })).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

  // Save the breakfast as a meal, then log it in one tap.
  await page.getByRole('button', { name: 'Save Breakfast as a meal' }).click();
  await page.getByLabel('Name').fill('Usual breakfast');
  await shot(page, '06-save-meal-sheet');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Saved "Usual breakfast"')).toBeVisible();
  await page.goto('/#/add');
  await page.getByRole('button', { name: 'My foods' }).click();
  await shot(page, '07-my-foods-saved-meals');
  await page.getByTestId('saved-meal').click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();

  // Postgres: ordinary rows, numbers copied from the snapshot, and the saved meal itself synced.
  await expect.poll(async () => (await serverRows(userId)).length, { timeout: 15_000 }).toBe(4);
  const rows = await serverRows(userId);
  const skyr = rows.filter((r) => r.name === 'Skyr Naturell');
  expect(skyr).toHaveLength(3);
  for (const r of skyr) {
    expect(r.grams).toBe(150);
    expect(r.kcal_total).toBeCloseTo(93);
    expect(r.meal).toBe('breakfast');
  }
  expect(rows.some((r) => r.source === 'unknown')).toBe(false);
  expect(pgRows(`select 1 from public.saved_meals where user_id = '${userId}' and name = 'Usual breakfast' and deleted_at is null`)).toHaveLength(1);
  expect(pgRows(`select 1 from public.saved_meal_items where user_id = '${userId}'`)).toHaveLength(1);
});
