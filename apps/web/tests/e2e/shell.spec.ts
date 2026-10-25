import { expect, test } from '@playwright/test';

test('the app shell loads with the Makro heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Makro' })).toBeVisible();
});
