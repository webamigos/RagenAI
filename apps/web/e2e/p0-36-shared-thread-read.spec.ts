import { test, expect } from '@playwright/test';

import {
  TEST_OTHER_USER_EMAIL,
  TEST_OTHER_USER_ID,
  TEST_OTHER_USER_PASSWORD,
  TEST_THREAD_ID,
  TEST_USER_ID,
} from './constants';
import { ROUTES } from './helpers';

/**
 * A thread shared with a member opens for them, read-only.
 *
 * `p0` because this failed silently: the thread was listed under
 * "Udostępnione dla mnie", and opening it showed an empty chat with a message
 * box — `api/messages` admitted the owner and org admins only, and a shared
 * reader got a 404 the page rendered as "no messages yet". Nothing else in
 * the suite opened a thread as anyone but its owner.
 *
 * The share is created here and removed afterwards, on the seeded thread, so
 * no other spec sees the second user holding it.
 */

const SEEDED_ANSWER = 'This is the assistant response to the seeded message.';
/** `assistant.chat.read-only-banner` in Polish. */
const READ_ONLY = /Przeglądasz wątek innego użytkownika/;

async function withPrisma<T>(fn: (prisma: any) => Promise<T>): Promise<T> {
  const { PrismaClient } = await import('../src/generated/prisma/client');
  const { PrismaPg } = await import('@prisma/adapter-pg');
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const share = { threadId: TEST_THREAD_ID, userId: TEST_OTHER_USER_ID };

test.beforeAll(async () => {
  await withPrisma(async (prisma) => {
    await prisma.threadShare.deleteMany({ where: share });
    await prisma.threadShare.create({
      data: { ...share, sharedByUserId: TEST_USER_ID },
    });
  });
});

test.afterAll(async () => {
  await withPrisma((prisma) => prisma.threadShare.deleteMany({ where: share }));
});

test('a member opens a thread shared with them and reads it, read-only', async ({
  browser,
}) => {
  const context = await browser.newContext({ storageState: undefined });
  const page = await context.newPage();
  try {
    await page.goto(ROUTES.signIn);
    await page.locator('input[type="email"]').fill(TEST_OTHER_USER_EMAIL);
    await page.locator('input[type="password"]').fill(TEST_OTHER_USER_PASSWORD);
    await page.getByTestId('sign-in-submit').click();
    await page.waitForURL('**/pl/new', { timeout: 15_000 });

    // By its URL, not its title: an earlier spec renames the seeded thread.
    await page
      .getByRole('navigation')
      .locator(`a[href$="/chats/${TEST_THREAD_ID}"]`)
      .first()
      .click();
    await page.waitForURL(`**/chats/${TEST_THREAD_ID}`, { timeout: 15_000 });

    await expect(page.getByText(SEEDED_ANSWER)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(READ_ONLY)).toBeVisible();
    // Read-only means no way to post into someone else's thread.
    await expect(page.locator('textarea')).toHaveCount(0);
  } finally {
    await context.close();
  }
});
