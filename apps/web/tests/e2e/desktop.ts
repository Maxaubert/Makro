// Shared by the 1440 px desktop specs: sign in with an emailed code and finish onboarding on the local stack.
import { expect, type Page } from '@playwright/test';
import { inviteUser, readOtp } from './local';

export async function desktopSignIn(page: Page, prefix: string, targetKg?: string): Promise<{ email: string; userId: string }> {
  const email = `${prefix}-${Date.now()}@example.test`;
  const userId = await inviteUser(email);
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
  return { email, userId };
}
