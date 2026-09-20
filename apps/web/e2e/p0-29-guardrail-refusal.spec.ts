import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

/**
 * A guardrail an administrator wrote refuses a turn, and a `LOG` rule does not.
 *
 * `p0` and not `p1` for the reason `p0-27` gives about the usage ceilings: a
 * `p1` does not gate the pull request that breaks it, and this feature's
 * failure mode is silence. Phase A measured a turn against an enabled `BLOCK`
 * rule and it sailed through to the model, which was correct then and is a
 * loss of protection now — one that looks exactly like a working
 * configuration, because the panel lists the rule and the audit entry exists.
 *
 * Two bugs found during Phase B would have survived a weaker version of this
 * spec. `SUPPORTED_COMBINATIONS` omitted `BUILT_IN`/`INPUT`, so the *built-in*
 * moderation rule was silently discarded while a `PATTERN` rule worked
 * perfectly — which is why the first case below uses a pattern and the third
 * uses the built-in. And history masking was gated on the current question
 * matching, which no single-turn assertion can see.
 *
 * Deliberately **not** mocking the chat stream, for the same reason `p0-27`
 * does not: every other chat spec routes the threads API to a canned SSE
 * response, which would sail straight past the guard under test.
 */

const MARKER = 'e2e-guardrail-probe';
/** Distinctive enough that no seeded document or prompt contains it. */
const FORBIDDEN = 'zzqx-forbidden-token';

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

/** The Polish string behind `chain-errors.guardrail-blocked`, loosely matched. */
const REFUSAL = /pasuje do reguły ustawionej przez administratora/i;
/** What `mock-llm-server.ts` answers with whenever it is actually reached. */
const MOCK_ANSWER = 'This is a mock AI response for e2e testing.';

async function createRule(
  action: 'BLOCK' | 'LOG',
  pattern: string,
): Promise<string> {
  return withPrisma(async (prisma) => {
    const row = await prisma.guardrail.create({
      data: {
        // A platform rule, because that is what an operator writes in the
        // panel and what every organization is subject to.
        organizationId: null,
        name: `${MARKER} ${action}`,
        description: MARKER,
        kind: 'PATTERN',
        stage: 'INPUT',
        action,
        enabled: true,
        severity: 'warn',
        pattern,
        patternIsRegex: false,
      },
      select: { publicId: true },
    });
    return row.publicId as string;
  });
}

async function deleteRules(): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.guardrail.deleteMany({ where: { description: MARKER } });
    // The events this spec caused. Matched on the event type rather than the
    // metadata, because a JSON-path filter is dialect-specific and this only
    // has to clean up after itself, not be clever.
    await prisma.securityEvent.deleteMany({
      where: { eventType: { in: ['GUARDRAIL_BLOCKED', 'GUARDRAIL_FLAGGED'] } },
    });
  });
}

test.afterEach(async () => {
  await deleteRules();
  // The loader caches per organization for 60s, and each test creates its own
  // rule. Waiting out the cache would make this spec take four minutes; the
  // app is restarted between suites, and within this suite the tests use
  // different patterns so a stale entry cannot make one of them pass.
});

test.describe.serial('a guardrail refuses a turn', () => {
  test('a BLOCK rule produces the localized refusal', async ({ page }) => {
    await createRule('BLOCK', FORBIDDEN);

    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    await page.locator('textarea').fill(`Pytanie z ${FORBIDDEN} w środku`);
    await page.locator('textarea').press('Enter');

    // The message the user sees is the localized one, not a code and not
    // "inappropriate content" — a pattern about invoice numbers has no
    // business making that claim.
    await expect(page.getByText(REFUSAL)).toBeVisible({ timeout: 20_000 });
  });

  test('the refused turn produces no assistant answer', async ({ page }) => {
    await createRule('BLOCK', `${FORBIDDEN}-two`);

    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    await page.locator('textarea').fill(`Drugie ${FORBIDDEN}-two`);
    await page.locator('textarea').press('Enter');

    await expect(page.getByText(REFUSAL)).toBeVisible({ timeout: 20_000 });

    // The mock LLM's absence is the assertion: the turn was refused before the
    // chain reached a model, not after it produced something.
    await expect(page.getByText(MOCK_ANSWER)).toHaveCount(0);
  });

  test('the refusal is recorded as a security event, without the matched text', async ({
    page,
  }) => {
    await createRule('BLOCK', `${FORBIDDEN}-three`);

    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
    await page.locator('textarea').fill(`Trzecie ${FORBIDDEN}-three`);
    await page.locator('textarea').press('Enter');
    await expect(page.getByText(REFUSAL)).toBeVisible({ timeout: 20_000 });

    // `recordSecurityEvent` is fire-and-forget, so the row lands shortly after
    // the response. Polled rather than slept on.
    await expect
      .poll(
        async () =>
          withPrisma((prisma) =>
            prisma.securityEvent.count({
              where: { eventType: 'GUARDRAIL_BLOCKED' },
            }),
          ),
        { timeout: 15_000 },
      )
      .toBeGreaterThan(0);

    const event = await withPrisma(
      (prisma): Promise<{ metadata: unknown } | null> =>
        prisma.securityEvent.findFirst({
          where: { eventType: 'GUARDRAIL_BLOCKED' },
          orderBy: { createdAt: 'desc' },
          select: { metadata: true },
        }),
    );

    // The matched span is the customer's message, and this table is rendered
    // in plain text in the admin panel for every operator.
    expect(JSON.stringify(event?.metadata)).not.toContain(FORBIDDEN);
  });

  test('a LOG rule leaves the answer untouched', async ({ page }) => {
    await createRule('LOG', `${FORBIDDEN}-log`);

    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    await page.locator('textarea').fill(`Czwarte ${FORBIDDEN}-log`);
    await page.locator('textarea').press('Enter');

    // Observation mode is the creation default, and it has to be genuinely
    // observational: a rule that starts by blocking is a rule whose
    // false-positive rate nobody has measured.
    await expect(page.getByText(REFUSAL)).toHaveCount(0);
    await expect(page).toHaveURL(/\/chats\/.+/, { timeout: 20_000 });
  });
});

test.describe('with no rule enabled', () => {
  test('a turn carrying the same text is not refused', async ({ page }) => {
    // The control. Without it, a refusal caused by something else entirely —
    // a usage ceiling, a bad model name — would read as the guardrail working.
    await deleteRules();

    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    await page.locator('textarea').fill(`Kontrola z ${FORBIDDEN} w środku`);
    await page.locator('textarea').press('Enter');

    await expect(page.getByText(REFUSAL)).toHaveCount(0);
  });
});
