// Weight screen against the local stack: log (now and on earlier days), the 7-day trend, range
// chips, edit, delete, and the rows in Postgres. Canvas boards B_Weight and B_LogWeight.
import { expect, test, type Page } from '@playwright/test';
import { inviteUser, pgRows, readOtp } from './local';

const SHOTS = process.env.SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

const pad = (n: number) => String(n).padStart(2, '0');
function daysAgoInput(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(7, 40, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function signInAndOnboard(page: Page, email: string, targetKg?: string) {
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
  if (targetKg) {
    await page.getByRole('button', { name: 'Lose', exact: true }).click();
    await page.getByLabel('Target weight').fill(targetKg);
  }
  await page.getByRole('button', { name: 'Start logging' }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
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
  await expect(sheet.getByText('Enter a weight between 30 and 400 kg')).toBeVisible();
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

const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'pc', width: 1280, height: 800 },
];

async function expectGraph(page: Page, label: string) {
  for (const size of SIZES) {
    await page.setViewportSize({ width: size.width, height: size.height });
    const graph = page.getByRole('img', { name: /Daily weight/ });
    await expect(graph, `${label} ${size.name}`).toBeVisible();
    const box = await graph.boundingBox();
    expect.soft(box?.height, `${label} ${size.name} graph height`).toBe(116);
    expect.soft(box?.width ?? 0, `${label} ${size.name} graph width`).toBeGreaterThan(300);
    expect.soft(box?.width ?? 999, `${label} ${size.name} graph stays in the phone column`).toBeLessThanOrEqual(380);
    await expect.soft(page.getByTestId('weight-bar').first(), `${label} ${size.name} bar`).toBeAttached();
    await expect.soft(page.getByText('Daily weight', { exact: true })).toBeVisible();
    await expect.soft(page.getByText('No bar: no weigh-in')).toBeVisible();
    await shot(page, `${label}-${size.name}`);
  }
}

test('weight: the graph and layout of the board, with one weigh-in and many, on a phone and a PC', async ({ page }) => {
  test.setTimeout(240_000);
  const email = `weight-graph-${Date.now()}@example.test`;
  await inviteUser(email);
  await signInAndOnboard(page, email, '78');
  await page.getByRole('link', { name: 'Weight', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Weight' })).toBeVisible();

  // One weigh-in: still a graph, with a kg axis and date labels.
  await expectGraph(page, 'one');
  await expect.soft(page.getByTestId('weight-axis')).toContainText('83');
  await expect.soft(page.getByTestId('weight-axis')).toContainText('80');
  await expect.soft(page.getByText('3.5 kg to goal')).toBeVisible();
  await expect.soft(page.getByText('Entries', { exact: true })).toBeVisible();
  await expect.soft(page.getByText('Tap one to edit')).toBeVisible();
  const rows = page.getByRole('list', { name: 'Weights' }).getByRole('link');
  await expect.soft(rows.first()).toHaveAccessibleName(/^Edit weight 81\.5 kg, Today \d\d:\d\d$/);
  await expect.soft(page.getByRole('link', { name: 'Back to Today' })).toBeVisible();

  // Many weigh-ins over the 30-day range, with two days left out as on the board.
  const kg = [83.0, 83.2, 82.9, 83.0, 82.6, 82.7, 82.4, 82.5, 82.2, 82.4, 82.1, 82.4, 82.1, 82.2, 81.9, 82.0, 81.6, 81.8, 81.4, 81.6, 81.3, 81.5, 81.3, 81.4, 81.6, 81.7, 81.2];
  for (let i = 0; i < kg.length; i++) {
    const daysAgo = 29 - i - (i >= 11 ? 2 : 0);
    if (daysAgo > 0) await logWeight(page, String(kg[i]), daysAgo);
  }
  await expect(page.getByText(/^7-day trend \d+\.\d kg$/)).toBeVisible();
  await expectGraph(page, 'many');
  await expect.soft(page.getByTestId('weight-axis')).toHaveCount(0);

  // A day with no weigh-in has no bar: 30 days, two gaps, and the rest all have a bar.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.soft(page.getByTestId('weight-bar')).toHaveCount(28);
  await shot(page, 'many-phone-30d');
  for (const range of ['7D', '90D', 'All']) {
    await page.getByRole('button', { name: range }).click();
    await shot(page, `many-phone-${range}`);
  }
  await page.getByRole('button', { name: '30D' }).click();

  // The sheets.
  await page.getByRole('link', { name: 'Log weight' }).click();
  await expect(page.getByRole('dialog', { name: 'Log weight' })).toBeVisible();
  await expect.soft(page.getByText('Type the number or use the steps')).toBeVisible();
  await shot(page, 'sheet-log');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await rows.nth(1).click();
  const edit = page.getByRole('dialog', { name: 'Edit weight' });
  await expect(edit).toBeVisible();
  await expect.soft(edit.getByText('Added by you')).toBeVisible();
  await shot(page, 'sheet-edit');
});
