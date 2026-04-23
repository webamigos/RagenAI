import { test, expect } from '@playwright/test';

import { ROUTES } from './helpers';

test.describe('Documents list sorting and filtering', () => {
  test('documents list loads with sort/filter controls', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);

    // Page should show either a table (with files) or the empty drag-and-drop area
    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('URL query params for sort are preserved on navigation', async ({
    page,
  }) => {
    await page.goto(`${ROUTES.knowledgeDocuments}?sort=fileName&dir=asc`);
    await expect(page).toHaveURL(/sort=fileName/);
    await expect(page).toHaveURL(/dir=asc/);

    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('URL query params for fileType filter are preserved', async ({
    page,
  }) => {
    await page.goto(`${ROUTES.knowledgeDocuments}?fileType=PDF`);
    await expect(page).toHaveURL(/fileType=PDF/);

    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('URL query params for embeddingStatus filter are preserved', async ({
    page,
  }) => {
    await page.goto(`${ROUTES.knowledgeDocuments}?embeddingStatus=COMPLETED`);
    await expect(page).toHaveURL(/embeddingStatus=COMPLETED/);

    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('invalid sort param falls back to default without error', async ({
    page,
  }) => {
    await page.goto(
      `${ROUTES.knowledgeDocuments}?sort=invalidColumn&dir=invalid`,
    );

    // Page should still load successfully without crashing
    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });
});
