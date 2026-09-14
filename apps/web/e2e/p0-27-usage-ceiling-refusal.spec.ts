import { test, expect } from '@playwright/test';

import { AUTH_FILE, TEST_ORG_ID } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

/**
 * The organization's monthly ceilings are enforced before the chain runs. For
 * five months they were enforced by nothing at all — `checkUsageLimitsQuery`
 * had no call site — and every static check stayed green throughout, which is
 * why this is `p0` and not `p1`: a `p1` does not gate the pull request that
 * breaks it.
 *
 * Deliberately **not** mocking the chat stream. Every other chat spec here
 * routes the threads API to a canned SSE response, which would sail past the
 * very guard under test. This one lets the request reach the server and
 * asserts on what the server decides.
 */
const MARKER = 'e2e-usage-ceiling';

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

let previousCostLimitCents: number | null = null;

test.beforeAll(async () => {
  await withPrisma(async (prisma) => {
    const settings = await prisma.organizationSettings.findUnique({
      where: { organizationId: TEST_ORG_ID },
      select: { monthlyCostLimitCents: true },
    });
    previousCostLimitCents = settings?.monthlyCostLimitCents ?? null;

    // One cent of allowance, and five dollars already spent this month.
    await prisma.organizationSettings.upsert({
      where: { organizationId: TEST_ORG_ID },
      update: { monthlyCostLimitCents: 1 },
      create: { organizationId: TEST_ORG_ID, monthlyCostLimitCents: 1 },
    });
    await prisma.aiUsage.create({
      data: {
        organizationId: TEST_ORG_ID,
        step: 'CHAT_COMPLETION',
        provider: MARKER,
        model: MARKER,
        inputTokens: 1,
        outputTokens: 1,
        totalTokens: 2,
        estimatedCost: 5,
      },
    });
  });
});

test.afterAll(async () => {
  await withPrisma(async (prisma) => {
    await prisma.aiUsage.deleteMany({
      where: { organizationId: TEST_ORG_ID, provider: MARKER },
    });
    await prisma.organizationSettings.update({
      where: { organizationId: TEST_ORG_ID },
      data: { monthlyCostLimitCents: previousCostLimitCents },
    });
  });
});

test.describe('monthly usage ceiling', () => {
  test('an organization over its cost ceiling is refused, in its own language', async ({
    page,
  }) => {
    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    await page.locator('textarea').fill('Czy odpowiesz mimo limitu?');
    await page.locator('textarea').press('Enter');

    // The Polish string behind `chain-errors.usage-limit-exceeded`. Matched on
    // a distinctive fragment rather than the whole sentence, so rewording the
    // second half does not fail a test about enforcement.
    await expect(
      page.getByText(/osiągnęła miesięczny limit użycia/i),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('no assistant answer is produced for the refused turn', async ({
    page,
  }) => {
    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    await page.locator('textarea').fill('Drugie pytanie ponad limitem');
    await page.locator('textarea').press('Enter');

    await expect(
      page.getByText(/osiągnęła miesięczny limit użycia/i),
    ).toBeVisible({ timeout: 15_000 });

    // `mock-llm-server.ts` answers with exactly this sentence whenever it is
    // reached. Its absence is the assertion: the turn was refused before the
    // chain ran, not after it produced something.
    await expect(
      page.getByText('This is a mock AI response for e2e testing.'),
    ).toHaveCount(0);
  });
});
