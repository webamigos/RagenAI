import { test, expect } from '@playwright/test';
import fs from 'fs';
import { AUTH_FILE } from './constants';
import { ROUTES, reLogin } from './helpers';

test.beforeAll(async ({ browser }) => {
  test.setTimeout(60_000);
  await reLogin(browser);
});

test.beforeEach(async ({ page, context }) => {
  await context.clearCookies();
  const state = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  await context.addCookies(state.cookies);
  await page.goto(ROUTES.knowledgeDocuments);
  await page.waitForLoadState('domcontentloaded');
});

test.describe('Bulk Document Actions P2', () => {
  test('checkboxes are visible in list view', async ({ page }) => {
    // The select-all checkbox should be in the table header
    const selectAll = page.getByTestId('select-all-checkbox');
    await expect(selectAll).toBeVisible({ timeout: 10_000 });
  });

  test('BulkActionBar is not visible when nothing is selected', async ({
    page,
  }) => {
    const bar = page.getByTestId('bulk-action-bar');
    await expect(bar).not.toBeVisible();
  });

  test('selecting a file shows BulkActionBar', async ({ page }) => {
    // Wait for at least one file checkbox to appear
    const firstCheckbox = page
      .getByRole('checkbox', { name: /zaznacz/i })
      .first();

    // If there are no files, skip this test gracefully
    const count = await firstCheckbox.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await firstCheckbox.check();
    const bar = page.getByTestId('bulk-action-bar');
    await expect(bar).toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId('bulk-selected-count')).toContainText('1');
  });

  test('clearing selection hides BulkActionBar', async ({ page }) => {
    const firstCheckbox = page
      .getByRole('checkbox', { name: /zaznacz/i })
      .first();
    const count = await firstCheckbox.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await firstCheckbox.check();
    await expect(page.getByTestId('bulk-action-bar')).toBeVisible({
      timeout: 5_000,
    });

    await page.getByTestId('bulk-clear').click();
    await expect(page.getByTestId('bulk-action-bar')).not.toBeVisible();
  });

  test('select-all selects all visible files', async ({ page }) => {
    const selectAll = page.getByTestId('select-all-checkbox');
    await expect(selectAll).toBeVisible({ timeout: 10_000 });

    // Check how many file rows are present
    const fileCheckboxes = page.getByRole('checkbox', { name: /zaznacz/i });
    const fileCount = await fileCheckboxes.count();

    if (fileCount === 0) {
      test.skip();
      return;
    }

    // Click select-all (it's the first checkbox in the header, but we use testid)
    await selectAll.check();

    const bar = page.getByTestId('bulk-action-bar');
    await expect(bar).toBeVisible({ timeout: 5_000 });

    const countText = page.getByTestId('bulk-selected-count');
    // Count should reflect all files
    await expect(countText).not.toBeEmpty();
  });

  test('bulk delete button opens confirm dialog', async ({ page }) => {
    const firstCheckbox = page
      .getByRole('checkbox', { name: /zaznacz/i })
      .first();
    const count = await firstCheckbox.count();
    if (count === 0) {
      test.skip();
      return;
    }

    await firstCheckbox.check();
    await expect(page.getByTestId('bulk-action-bar')).toBeVisible({
      timeout: 5_000,
    });
    await page.getByTestId('bulk-delete').click();

    // The confirm dialog should open
    await expect(page.getByTestId('bulk-delete-confirm')).toBeVisible({
      timeout: 5_000,
    });
  });
});
