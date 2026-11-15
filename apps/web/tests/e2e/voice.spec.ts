// Log by voice is a shell for now (decision 52): the screen opens from Add food, and nothing acts yet.
import { devices, expect, test } from '@playwright/test';
import { desktopSignIn } from './desktop';

test.use({ ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } });

test('voice: the screen opens from Add food and does nothing yet', async ({ page }) => {
  await desktopSignIn(page, 'voice');
  await page.getByRole('link', { name: 'Add food', exact: true }).first().click();
  await page.getByRole('link', { name: 'Voice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Log by voice', exact: true })).toBeVisible();
  await page.getByTestId('voice-text').fill('to egg');
  await page.getByTestId('voice-mic').click();
  await expect(page.getByTestId('voice-soon')).toBeVisible();
  await expect(page.getByTestId('voice-log')).toBeDisabled();
});
