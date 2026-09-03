import { expect, type Page } from '@playwright/test';

import { ADMIN_EMAIL, ADMIN_PASSWORD, ROUTES } from './constants';

/**
 * Sign in through the form, the way a person does.
 *
 * Deliberately not a database or cookie shortcut: the role check that keeps
 * customers out of the panel runs in the dashboard layout on every request,
 * and a shortcut that plants a session would skip the one thing most worth
 * testing.
 */
export async function signIn(
  page: Page,
  email: string = ADMIN_EMAIL,
  password: string = ADMIN_PASSWORD,
): Promise<void> {
  await page.goto(ROUTES.login);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
}

/** Wait for a dashboard page to have rendered its heading. */
export async function expectPage(page: Page, heading: string): Promise<void> {
  await expect(
    page.getByRole('heading', { name: heading, level: 1 }),
  ).toBeVisible({ timeout: 15_000 });
}
