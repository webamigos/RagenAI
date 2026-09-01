import { mkdir } from 'fs/promises';
import path from 'path';
import { test as setup, expect } from '@playwright/test';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

import { AUTH_FILE, TEST_USER_ID, TEST_ORG_ID } from './constants';
import { login } from './helpers';

setup('authenticate', async ({ page }) => {
  await login(page);
  await expect(page).toHaveURL(/\/pl\/new/, { timeout: 15_000 });

  // Set activeOrganizationId on the session so authenticated pages work.
  // The login form calls finalizeOnboardingCommand which does this via auth API,
  // but it may fail on CI. Do it directly via Prisma as a reliable fallback.
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

  await mkdir(path.dirname(AUTH_FILE), { recursive: true });
  await page.context().storageState({ path: AUTH_FILE });
});
