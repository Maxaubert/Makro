// Desktop Add food (board D_Log) at 1440 px against the local stack: tabs, results table with source
// and verified, the portion panel, favourite, a barcode typed by hand, and the add flow.
import { devices, expect, test } from '@playwright/test';
import { pgRows } from './local';
import { desktopSignIn } from './desktop';

test.use({ ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } });

test('desktop Add food: search, portion panel, favourite, barcode, add', async ({ page }) => {
  const { userId } = await desktopSignIn(page, 'desktop-log');
  await page.getByRole('link', { name: 'Add food', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Add food', exact: true })).toBeVisible();

  // Empty Recent: the board's empty state, and the panel asks for a choice.
  await expect(page.getByText('Foods you log show up here.')).toBeVisible();
  await expect(page.getByText('Choose a food from the list to see its portion.')).toBeVisible();

  // Results table: columns, kcal per 100 g, source and verified on every row, unknown stays "No data".
  await page.getByRole('textbox', { name: 'Search foods' }).fill('skyr');
  const rows = page.getByTestId('food-row');
  await expect(rows.first()).toContainText('Skyr Naturell');
  await expect(rows.first()).toContainText('62');
  await expect(rows.first()).toContainText('Verified');
  await expect(page.getByText('Product, per 100 g')).toBeVisible();
  await expect(rows.filter({ hasText: 'No data' }).first()).toContainText('Not verified');
  await expect(page.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');

  // The panel follows the first row; a no-data row says unknown stays unknown and does not invent numbers.
  const panel = page.getByRole('complementary', { name: 'Portion' });
  await expect(panel.getByTestId('portion-name')).toHaveText('Skyr Naturell');
  await expect(panel.getByRole('img', { name: 'Verified' })).toBeVisible();
  await rows.filter({ hasText: 'No data' }).first().click();
  await expect(panel.getByText(/no nutrition data yet.*unknown stays unknown, never zero/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Log without numbers' })).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Enter numbers from the label' })).toBeVisible();

  // Stepper, live portion maths (62 kcal per 100 g), unknown fibre.
  await rows.first().click();
  await expect(panel.getByLabel('Amount')).toHaveValue('100');
  await panel.getByRole('button', { name: 'More' }).click();
  await expect(panel.getByLabel('Amount')).toHaveValue('110');
  await expect(panel.getByTestId('portion-kcal')).toContainText('68');
  // The pack size is a portion choice: the 450 g tub is 279 kcal.
  await panel.getByRole('button', { name: 'Pack 450 g' }).click();
  await expect(panel.getByLabel('Amount')).toHaveValue('450');
  await expect(panel.getByTestId('portion-kcal')).toContainText('279');
  await panel.getByLabel('Amount').fill('150');
  await expect(panel.getByTestId('portion-kcal')).toContainText('93');
  await expect(panel.getByTestId('portion-fibre_g')).toHaveText('Unknown');
  await panel.getByRole('button', { name: 'Breakfast', exact: true }).click();

  // Favourite, then the Favourites tab lists it.
  await panel.getByRole('button', { name: 'Favourite' }).click();
  await expect(panel.getByRole('button', { name: 'Favourite' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Favourites' }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('Skyr Naturell');

  // Add without leaving the page: the status links to the diary, and Postgres gets the row (150 g, breakfast).
  await panel.getByLabel('Amount').fill('150');
  await panel.getByRole('button', { name: 'Breakfast', exact: true }).click();
  await panel.getByRole('button', { name: 'Add to Breakfast' }).click();
  await expect(page.getByTestId('portion-added')).toContainText('Added to Breakfast.');
  await expect(page.getByRole('heading', { name: 'Add food', exact: true })).toBeVisible();
  await expect
    .poll(() => pgRows<{ quantity: number; meal: string }>(`select quantity, meal from public.log_entries where user_id = '${userId}'`), { timeout: 20_000 })
    .toEqual([{ quantity: 150, meal: 'breakfast' }]);

  // Recent now has the food, with its macros read back.
  await page.getByRole('button', { name: 'Recent' }).click();
  await expect(rows).toHaveCount(1);

  // Type a barcode that is not in the database: the board's "Add custom food" way out stays.
  await page.getByRole('button', { name: 'Type a barcode' }).click();
  await page.getByLabel('Barcode').fill('4006381333931');
  await page.getByRole('button', { name: 'Find product' }).click();
  await expect(page.getByText('Not in the database: 4006381333931')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Add custom food' })).toHaveAttribute('href', /ean=4006381333931/);
  await page.getByRole('button', { name: 'Search by name' }).click();

  // A wide window does not break it, and 390 px is the phone column.
  await page.setViewportSize({ width: 2200, height: 1100 });
  await expect(rows.first()).toBeVisible();
  expect(await page.locator('html').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator('.desktop-shell')).toHaveCount(0);
});

test('desktop Add food: a food stored per portion is logged in portions (decision 42)', async ({ page }) => {
  const { userId } = await desktopSignIn(page, 'desktop-portion');
  await page.getByRole('link', { name: 'Add food', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Search foods' }).fill('whopper');
  const rows = page.getByTestId('food-row');
  await expect(rows.first()).toContainText('Whopper');
  await expect(rows.first()).toContainText('per portion');

  // One portion is the printed value; no grams and no pack buttons.
  const panel = page.getByRole('complementary', { name: 'Portion' });
  await expect(panel.getByLabel('Amount')).toHaveValue('1');
  await expect(panel.getByTestId('portion-kcal')).toContainText('621');
  await expect(panel.getByRole('button', { name: /^Pack / })).toHaveCount(0);
  await panel.getByRole('button', { name: 'More' }).click();
  await expect(panel.getByLabel('Amount')).toHaveValue('2');
  await expect(panel.getByTestId('portion-kcal')).toContainText('1,242');

  // Saved as 2 portions: grams holds 100 per portion, so the server total is 2 x 621.
  await panel.getByRole('button', { name: /^Add to / }).click();
  await expect
    .poll(() => pgRows<{ quantity: number; unit: string; kcal_total: number }>(`select quantity, unit, kcal_total from public.log_entries where user_id = '${userId}'`), { timeout: 20_000 })
    .toEqual([{ quantity: 2, unit: 'portion', kcal_total: 1242 }]);
});
