import { test, expect } from '@playwright/test';
import { TEST_USER_NAME, TEST_ORG2_NAME } from './constants';

test.describe('Organization Switcher', () => {
  test('should display org switcher dropdown for admin user', async ({
    page,
  }) => {
    await page.goto('/pl/new');
    await page.waitForURL('**/pl/**', { timeout: 15_000 });

    // The active org name should be visible in the sidebar
    const orgName = `${TEST_USER_NAME}'s Organization`;
    await expect(page.getByText(orgName, { exact: false })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('should switch organization when clicking another org', async ({
    page,
  }) => {
    await page.goto('/pl/new');
    await page.waitForURL('**/pl/**', { timeout: 15_000 });

    // Click the org switcher dropdown button
    const orgName = `${TEST_USER_NAME}'s Organization`;
    const switcher = page.getByText(orgName, { exact: false }).first();
    await switcher.click();

    // The second org should appear in the dropdown
    const secondOrg = page.getByText(TEST_ORG2_NAME);
    await expect(secondOrg).toBeVisible({ timeout: 5_000 });

    // Click the second org to switch
    await secondOrg.click();

    // After switch, the page should reload and show the second org name
    await page.waitForLoadState('networkidle', { timeout: 15_000 });
    await expect(page.getByText(TEST_ORG2_NAME, { exact: false })).toBeVisible({
      timeout: 15_000,
    });
  });
});
