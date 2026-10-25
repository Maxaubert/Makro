import { expect, test } from '@playwright/test';

test('the app opens on the sign-in screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to Makro' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeDisabled();
});
