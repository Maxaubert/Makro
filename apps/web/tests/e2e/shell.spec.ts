import { expect, test } from '@playwright/test';

test('the app opens on the sign-in screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to Makro' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Email me a code' })).toBeDisabled();
});

test('sign-in follows D_SignIn from 1024 px and stays the phone column below it', async ({ page }) => {
  const input = page.getByLabel('Email address');

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Sign in to Makro' })).toBeVisible();
  expect((await input.boundingBox())?.width).toBe(420);
  await expect(input).toHaveAttribute('placeholder', 'Email address');
  await expect(page.getByText('Continue with Apple')).toHaveCount(0);

  await page.setViewportSize({ width: 1023, height: 800 });
  await expect(input).toHaveAttribute('placeholder', 'you@example.com');
  expect((await input.boundingBox())?.width).toBeLessThanOrEqual(408);
});
