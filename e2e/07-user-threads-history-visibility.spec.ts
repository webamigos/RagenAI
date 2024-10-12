import { test, expect } from '@playwright/test';
import { setupClerkTestingToken } from '@clerk/testing/playwright';

test.setTimeout(30000);

test.describe('User Threads History - Display Category When Threads Exist', () => {
  test.beforeEach(async ({ page }) => {
    await setupClerkTestingToken({ page });
    await page.goto('/en/sign-in');
    await page.waitForSelector('input[name="email"]', { timeout: 20000 });

    const testEmail = process.env.TESTS_CLERK_USER_EMAIL!;
    const testPassword = process.env.TESTS_CLERK_USER_PASSWORD!;

    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.locator('#email').fill(testEmail);
    await page.locator('#password').fill(testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/en/, { timeout: 10000 });

    let atLeastOneCategoryVisible = false;
    const categoriesEnglish = ['today', 'yesterday', 'older'];

    for (const category of categoriesEnglish) {
      const categoryLabel = page.getByText(category);
      if (await categoryLabel.isVisible()) {
        atLeastOneCategoryVisible = true;
        break;
      }
    }

    expect(atLeastOneCategoryVisible).toBe(true);
  });
});
