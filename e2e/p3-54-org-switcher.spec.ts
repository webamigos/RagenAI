import { test, expect } from '@playwright/test';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  TEST_USER_NAME,
  TEST_USER_ID,
  TEST_ORG_ID,
  TEST_ORG2_NAME,
} from './constants';

// Reset activeOrganizationId after org switcher tests to avoid corrupting
// subsequent tests that depend on TEST_ORG_ID being active.
test.afterAll(async () => {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL!,
  });
  const prisma = new PrismaClient({ adapter });
  try {
    await prisma.session.updateMany({
      where: { userId: TEST_USER_ID },
      data: { activeOrganizationId: TEST_ORG_ID },
    });
  } finally {
    await prisma.$disconnect();
  }
});

test.describe('Organization Switcher', () => {
  test('should display org switcher dropdown for admin user', async ({
    page,
  }) => {
    await page.goto('/pl/new');
    await page.waitForURL('**/pl/**', { timeout: 15_000 });

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

    const orgName = `${TEST_USER_NAME}'s Organization`;
    const switcher = page.getByText(orgName, { exact: false }).first();
    await switcher.click();

    const secondOrg = page.getByText(TEST_ORG2_NAME);
    await expect(secondOrg).toBeVisible({ timeout: 5_000 });

    await secondOrg.click();

    // After switch, the second org name should appear in the sidebar
    await expect(page.getByText(TEST_ORG2_NAME, { exact: false })).toBeVisible({
      timeout: 15_000,
    });
  });
});
