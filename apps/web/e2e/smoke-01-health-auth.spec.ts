import { test, expect } from '@playwright/test';

import { ROUTES } from './helpers';

test.describe('Smoke tests', () => {
  test('healthcheck endpoint returns 200', async ({ request }) => {
    const response = await request.get('/api/healthcheck');
    expect(response.status()).toBe(200);
  });

  test('sign-in page loads', async ({ page }) => {
    await page.goto(ROUTES.signIn);
    await expect(page).toHaveURL(/sign-in/);
    await expect(page.getByTestId('sign-in-submit')).toBeVisible();
  });

  test('sign-up page loads', async ({ page }) => {
    await page.goto(ROUTES.signUp);
    await expect(page).toHaveURL(/sign-up/);
  });

  test('unauthenticated user is redirected to sign-in', async ({ page }) => {
    await page.goto('/pl/new');
    await expect(page).toHaveURL(/sign-in/, { timeout: 10_000 });
  });

  test('unauthenticated user cannot access knowledge analytics page', async ({
    page,
  }) => {
    await page.goto('/pl/organization/knowledge-analytics');
    await expect(page).not.toHaveURL(/knowledge-analytics/, {
      timeout: 10_000,
    });
  });
});
