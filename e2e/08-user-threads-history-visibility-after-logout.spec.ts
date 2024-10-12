import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/threads', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        threads: [
          { id: '1', category: 'today' },
          { id: '2', category: 'yesterday' },
          { id: '3', category: 'older' },
        ],
      }),
    });
  });
  await page.goto('/en');
});

test('should hide threads after user logs out', async ({ page }) => {
  const testEmail = process.env.TESTS_CLERK_USER_EMAIL!;
  const testPassword = process.env.TESTS_CLERK_USER_PASSWORD!;

  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.locator('#email').fill(testEmail);
  await page.locator('#password').fill(testPassword);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('/en', { timeout: 15000 });

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

  atLeastOneCategoryVisible = false;
  await page.getByLabel('Dropdown menu').click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await page.waitForTimeout(3000);

  for (const category of categoriesEnglish) {
    const categoryLabel = page.getByText(category);
    if (await categoryLabel.isVisible()) {
      atLeastOneCategoryVisible = true;
      break;
    }
  }

  expect(atLeastOneCategoryVisible).toBe(false);
});
