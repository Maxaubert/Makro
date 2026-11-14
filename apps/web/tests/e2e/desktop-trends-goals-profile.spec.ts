// Desktop Trends, Goals and Profile (boards D_Trends, D_Goals, D_Profile) at 1440 px against the local stack.
import { devices, expect, test, type Page } from '@playwright/test';
import { pgRows } from './local';
import { desktopSignIn } from './desktop';

test.use({ ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } });

const pad = (n: number) => String(n).padStart(2, '0');
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Skyr Naturell is 62 kcal per 100 g in the fixture, so 400 g is 248 kcal. */
async function logSkyr(page: Page, daysBack: number, grams: number) {
  await page.goto(`/#/add?date=${daysAgo(daysBack)}`);
  await page.getByRole('textbox', { name: 'Search foods' }).fill('skyr');
  await page.getByTestId('food-row').filter({ hasText: 'Skyr Naturell' }).click();
  await page.getByLabel('Amount').fill(String(grams));
  await page.getByRole('button', { name: /^Add to / }).click();
  // A past day goes on to its end-of-day screen.
  await expect(page).toHaveURL(/day-end/);
}

async function expectWideAndPhone(page: Page, probe: ReturnType<Page['locator']>) {
  await page.setViewportSize({ width: 2200, height: 1100 });
  await expect(probe).toBeVisible();
  expect(await page.locator('html').evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(page.locator('.desktop-shell')).toHaveCount(0);
}

test('desktop Trends: average, ranges, stats, weekday pattern, macros and weight card', async ({ page }) => {
  await desktopSignIn(page, 'desktop-trends', '78');
  // Five logged days of the last seven: 248, 403, 558, 186 and 744 kcal (average 428).
  for (const [back, grams] of [[1, 400], [2, 650], [3, 900], [5, 300], [6, 1200]] as const) await logSkyr(page, back, grams);

  await page.goto('/#/trends');
  await expect(page.getByRole('heading', { name: 'Trends', exact: true })).toBeVisible();
  await expect(page.getByText('Daily average', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '7D' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('trends-average')).toHaveText('428 kcal');
  await expect(page.getByTestId('trends-vs-goal')).toContainText('under goal');
  await expect(page.getByText(/^Goal 2,250$/)).toBeVisible();
  await expect(page.getByTestId('trends-logged')).toHaveText('5/7');
  await expect(page.getByTestId('trends-on-target')).toHaveText('0/5');
  await expect(page.getByTestId('trends-highest')).toHaveText('744');
  await expect(page.getByTestId('trends-lowest')).toHaveText('186');
  // Days with nothing logged are left out and counted in a chip, never counted as 0.
  await expect(page.getByTestId('trends-coverage').getByRole('img', { name: /^2 days with nothing logged, left out, not counted as 0/ })).toHaveText('2');
  await expect(page.getByTestId('trends-bar')).toHaveCount(7);
  // Skyr has no fibre value: unknown, not 0.
  await expect(page.getByTestId('trends-macro-fibre_g')).toContainText('?');
  await expect(page.getByTestId('trends-macro-fibre_g').getByTestId('trends-macro-coverage')).toHaveText('0/5');
  await expect(page.getByTestId('trends-macro-coverage')).toHaveCount(1);
  // One weigh-in only: the change is unknown.
  await expect(page.getByTestId('trends-weight')).toHaveText('?');

  // Ranges change the title, the number of bars and the weight card.
  await page.getByRole('button', { name: '30D' }).click();
  await expect(page.getByRole('button', { name: '30D' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('trends-bar')).toHaveCount(30);
  await expect(page.getByTestId('trends-logged')).toHaveText('5/30');
  await expect(page.getByRole('link', { name: /^Weight change, last 30 days/ })).toBeVisible();
  await page.getByRole('button', { name: '90D' }).click();
  await expect(page.getByText('Daily average, by week')).toBeVisible();
  await expect(page.getByTestId('trends-average')).toHaveText('428 kcal');

  // The weight card opens the Weight screen.
  await page.getByTestId('trends-weight').click();
  await expect(page.getByRole('heading', { name: 'Weight', exact: true })).toBeVisible();

  await page.goto('/#/trends');
  await expectWideAndPhone(page, page.getByTestId('trends-average'));
});

test('desktop Goals: pick a goal type, the numbers follow, save writes one goal row', async ({ page }) => {
  const { userId } = await desktopSignIn(page, 'desktop-goals', '78');
  const goals = () => pgRows<{ kcal_target: number; goal_type: string; deleted_at: string | null }>(`select kcal_target, goal_type, deleted_at from public.goals where user_id = '${userId}' and deleted_at is null order by created_at`);

  await page.getByRole('link', { name: 'Goals', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Goals', exact: true })).toBeVisible();
  const lose = page.getByRole('button', { name: /^Lose/ });
  await expect(lose).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Target weight')).toHaveValue('78');
  await expect(page.getByLabel('Pace')).toHaveValue('0.5');
  await expect(page.getByLabel('Daily calories')).toHaveValue('2,250');
  // About you comes from onboarding.
  await expect(page.getByLabel('Sex')).toHaveValue('male');
  await expect(page.getByLabel('Age')).toHaveValue('30');
  await expect(page.getByLabel('Height')).toHaveValue('182');
  await expect(page.getByLabel('Weight', { exact: true })).toHaveValue('81.5');
  // The split adds up to 100 and fibre has no kcal of its own (decision 39).
  await expect(page.getByTestId('macro-split').locator('div > div')).toHaveCount(3);
  const shares = await Promise.all(['Protein', 'Carbs', 'Fat'].map(async (m) => Number(await page.getByLabel(`${m} share`).inputValue())));
  expect(shares.reduce((a, b) => a + b, 0)).toBe(100);
  await expect(page.getByLabel('Fibre')).toHaveValue('30');
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/desktop-goals.png` });
  // A step on one share leaves the others; Save waits until the total is 100 again (decision 40).
  await page.getByRole('button', { name: 'More protein' }).click();
  await expect(page.getByLabel('Protein share')).toHaveValue(String(shares[0] + 1));
  await expect(page.getByLabel('Carbs share')).toHaveValue(String(shares[1]));
  await expect(page.getByTestId('split-total')).toHaveText('101%');
  await expect(page.getByRole('button', { name: 'Save goal' })).toBeDisabled();
  await page.getByRole('button', { name: 'Less protein' }).click();
  await expect(page.getByTestId('split-total')).toHaveText('100%');
  await expect(page.getByRole('button', { name: 'Save goal' })).toBeVisible();

  // Maintain: higher calories, no target or pace of its own.
  await page.getByRole('button', { name: /^Maintain/ }).click();
  await expect(page.getByRole('button', { name: /^Maintain/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel('Daily calories')).not.toHaveValue('2,250');
  const kcal = Number((await page.getByLabel('Daily calories').inputValue()).replace(/\D/g, ''));
  expect(kcal).toBeGreaterThan(2250);
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  await expect.poll(async () => (await goals()).at(-1)?.kcal_target, { timeout: 15_000 }).toBe(kcal);
  expect((await goals()).at(-1)?.goal_type).toBe('maintain');

  // Typing your own calories is kept, and the Today screen follows.
  await page.getByLabel('Daily calories').fill('2600');
  await page.getByRole('button', { name: 'Save goal' }).click();
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible();
  await expect.poll(async () => (await goals()).at(-1)?.kcal_target, { timeout: 15_000 }).toBe(2600);
  await page.getByRole('link', { name: 'Today', exact: true }).first().click();
  await expect(page.getByText('Goal 2,600 kcal').first()).toBeVisible();

  await page.goto('/#/goals');
  await expectWideAndPhone(page, page.getByLabel('Daily calories'));
});

test('desktop Profile: account, your data, popular foods switch and the delete dialog', async ({ page }) => {
  const { email } = await desktopSignIn(page, 'desktop-profile', '78');
  await page.getByRole('link', { name: new RegExp(email.split('@')[0]) }).first().click();
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  await expect(page.getByText(email, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  // Profile facts come from the saved goal; the Goals row shows its calories.
  await expect(page.getByText('Male', { exact: true })).toBeVisible();
  await expect(page.getByText('182 cm')).toBeVisible();
  await expect(page.getByRole('link', { name: /^Goals/ }).last()).toContainText('2,250 kcal');
  await expect(page.getByText('Backup and sync')).toBeVisible();
  // Left out on purpose (the web cannot do them): Apple sign-in, Apple Health, devices.
  await expect(page.getByText('Apple Health')).toHaveCount(0);
  await expect(page.getByText('Signed in with Apple')).toHaveCount(0);

  // Export gives a JSON file.
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /Export my data/ }).click();
  expect((await download).suggestedFilename()).toBe('makro-data.json');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  // The popular-foods switch flips.
  const popular = page.getByRole('switch', { name: 'Count toward popular foods' });
  await expect(popular).toBeEnabled();
  const before = await popular.getAttribute('aria-checked');
  await popular.click();
  await expect(popular).not.toHaveAttribute('aria-checked', before ?? '');

  // Delete: the dialog opens, Escape and Cancel keep the account, the red button deletes (server call stubbed).
  await page.getByRole('button', { name: 'Delete account and data' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete account and data?' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Delete account and data' }).click();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await page.route('**/functions/v1/delete-account', (r) => r.fulfill({ status: 200, json: { ok: true } }));
  await page.getByRole('button', { name: 'Delete account and data' }).click();
  await dialog.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeVisible();
});

test('desktop Profile: wide window and phone width', async ({ page }) => {
  await desktopSignIn(page, 'desktop-profile-wide');
  await page.goto('/#/account');
  await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible();
  await expectWideAndPhone(page, page.getByRole('heading', { name: 'Profile', exact: true }));
});
