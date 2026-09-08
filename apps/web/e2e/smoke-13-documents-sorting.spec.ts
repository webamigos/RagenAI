import { test, expect } from '@playwright/test';

import { ROUTES } from './helpers';

test.describe('Documents list sorting and filtering', () => {
  test('documents list loads with sort/filter controls', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(page).toHaveURL(/documents-list/);

    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('clicking "Nazwa pliku" column header sets sort=fileName&dir=asc in URL', async ({
    page,
  }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    // The testid is on the `th`; the click handler is on the left-aligned
    // button inside it. Clicking the header cell lands on the button only
    // while the column stays narrow, so this stopped navigating — silently,
    // with no click error — as soon as a longer file name widened the column.
    await page.getByTestId('sort-header-fileName').locator('button').click();

    await expect(page).toHaveURL(/sort=fileName/, { timeout: 5_000 });
    await expect(page).toHaveURL(/dir=asc/);
  });

  test('clicking "Nazwa pliku" again toggles dir to desc', async ({ page }) => {
    await page.goto(`${ROUTES.knowledgeDocuments}?sort=fileName&dir=asc`);
    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    // The testid is on the `th`; the click handler is on the left-aligned
    // button inside it. Clicking the header cell lands on the button only
    // while the column stays narrow, so this stopped navigating — silently,
    // with no click error — as soon as a longer file name widened the column.
    await page.getByTestId('sort-header-fileName').locator('button').click();

    await expect(page).toHaveURL(/sort=fileName/, { timeout: 5_000 });
    await expect(page).toHaveURL(/dir=desc/);
  });

  test('sort direction icon is visible in active sort column header', async ({
    page,
  }) => {
    await page.goto(`${ROUTES.knowledgeDocuments}?sort=fileName&dir=asc`);
    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId('sort-icon-fileName')).toBeVisible();
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

    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('viewMode=my-files param is preserved in URL and page loads without error', async ({
    page,
  }) => {
    await page.goto(`${ROUTES.knowledgeDocuments}?viewMode=my-files`);
    await expect(page).toHaveURL(/viewMode=my-files/);

    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('viewMode=shared-with-me param is preserved in URL and page loads without error', async ({
    page,
  }) => {
    await page.goto(`${ROUTES.knowledgeDocuments}?viewMode=shared-with-me`);
    await expect(page).toHaveURL(/viewMode=shared-with-me/);

    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('invalid viewMode param falls back to default without error', async ({
    page,
  }) => {
    await page.goto(`${ROUTES.knowledgeDocuments}?viewMode=invalid-mode`);

    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test('sort header button is focusable via keyboard', async ({ page }) => {
    await page.goto(ROUTES.knowledgeDocuments);
    await expect(
      page.locator('table, [class*="border-dashed"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    const sortBtn = page.getByTestId('sort-header-fileName').locator('button');
    await sortBtn.focus();
    await expect(sortBtn).toBeFocused();
  });
});
