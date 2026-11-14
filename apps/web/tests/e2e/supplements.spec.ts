// Daily supplements (#52, canvas B8 switch and B2b): add every day from the portion screen, the
// Diary section, the next day's entry made on its own, Skip today, Stop adding daily. Every step is
// checked in Postgres. Runs against the local stack and the fixture product file.
import { expect, test, type Page } from '@playwright/test';
import { inviteUser, pgRows, readOtp } from './local';

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

const day = (n: number, hour = 8) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const liveOn = (userId: string, date: string): number =>
  pgRows<{ n: number }>(
    `select count(*)::int as n from public.log_entries where user_id = '${userId}' and meal = 'supplements' and deleted_at is null and local_date = '${date}'`,
  )[0]?.n ?? 0;

async function openDiaryOn(page: Page, when: Date) {
  await page.clock.setFixedTime(when);
  await page.goto('/#/diary');
  await page.reload();
}

test('a daily supplement is added every day, can be skipped for a day and stopped', async ({ page }) => {
  const email = `supp-${Date.now()}@example.test`;
  const userId = await inviteUser(email);
  await page.clock.install({ time: day(0) });
  await signInAndOnboard(page, email);

  // Add every day from the portion screen: no meal to pick, the button says where it goes.
  await page.goto('/#/add');
  await page.getByRole('textbox', { name: 'Search foods' }).fill('skyr');
  await page.getByTestId('food-row').filter({ hasText: 'Skyr Naturell' }).click();
  await page.getByLabel('Amount').fill('150');
  await page.getByTestId('add-every-day').click();
  await expect(page.getByRole('group', { name: 'Meal' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Add to daily supplements' }).click();

  const section = page.getByRole('region', { name: 'Daily supplements' });
  await expect(section.getByTestId('supplement-entry')).toHaveCount(1);
  await expect(section.getByRole('img', { name: 'Added every day' })).toBeVisible();
  await expect.poll(() => liveOn(userId, iso(day(0))), { timeout: 15_000 }).toBe(1);
  await expect
    .poll(() => pgRows<{ n: number }>(`select count(*)::int as n from public.daily_supplements where user_id = '${userId}'`)[0]?.n, { timeout: 15_000 })
    .toBe(1);

  // Tomorrow it is there without doing anything, once.
  await openDiaryOn(page, day(1));
  await expect(page.getByRole('region', { name: 'Daily supplements' }).getByTestId('supplement-entry')).toHaveCount(1);
  await expect.poll(() => liveOn(userId, iso(day(1))), { timeout: 15_000 }).toBe(1);

  // Skip today: gone today, and a reload does not bring it back.
  await page.getByTestId('supplement-entry').click();
  await expect(page.getByRole('heading', { name: 'Daily supplement' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip today' }).click();
  await expect(page.getByTestId('supplement-entry')).toHaveCount(0);
  await expect.poll(() => liveOn(userId, iso(day(1))), { timeout: 15_000 }).toBe(0);
  await openDiaryOn(page, day(1, 12));
  await expect(page.getByTestId('diary-entry').or(page.getByTestId('supplement-entry'))).toHaveCount(0);
  expect(await liveOn(userId, iso(day(1)))).toBe(0);

  // The day after it is back; then stop adding it daily: today stays, tomorrow is empty.
  await openDiaryOn(page, day(2));
  await expect(page.getByTestId('supplement-entry')).toHaveCount(1);
  await page.getByTestId('supplement-entry').click();
  await page.getByRole('button', { name: 'Stop adding daily' }).click();
  await expect(page.getByTestId('supplement-entry')).toHaveCount(1);
  await expect.poll(() => liveOn(userId, iso(day(2))), { timeout: 15_000 }).toBe(1);
  await openDiaryOn(page, day(3));
  await expect(page.getByText('Nothing logged', { exact: true })).toBeVisible();
  expect(await liveOn(userId, iso(day(3)))).toBe(0);

  // Earlier days keep their entries.
  expect(await liveOn(userId, iso(day(0)))).toBe(1);
});
