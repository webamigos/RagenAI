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
 * rule and it went through to the model — correct then, a silent loss of
 * protection now, and one that looks exactly like a working configuration
 * because the panel lists the rule and the audit entry exists.
 *
 * **The rules are seeded, not created here, and that is the whole lesson of
 * this file.** The first version created them in `beforeAll`. It passed
 * locally and failed in CI three retries out of three: the loader caches a
 * resolved rule set per organization for 60 s, so a rule written mid-suite is
 * invisible to a server that has already served a hundred specs — while
 * running the spec alone gives a freshly booted server with a cold cache,
 * which sees it at once. The spec's own comment asserted it "exercises a cold
 * cache every time"; that was true only in isolation, which is the one way it
 * was never going to run.
 *
 * Seeded fixtures exist before any server boots, so no cached set can be
 * missing them. See `e2e/seed/e2e-seed.ts`.
 *
 * Deliberately **not** mocking the chat stream, for the same reason `p0-27`
 * does not: every other chat spec routes the threads API to a canned SSE
 * response, which would sail straight past the guard under test.
 */

/** Matches the seeded `BLOCK` fixture. Appears nowhere else in this suite. */
const BLOCKED = 'zzqx-blocked-token';
/** Matches the seeded `LOG` fixture. */
const LOGGED = 'zzqx-logged-token';

/** The Polish string behind `chain-errors.guardrail-blocked`, loosely matched. */
const REFUSAL = /pasuje do reguły ustawionej przez administratora/i;
/** What `mock-llm-server.ts` answers with whenever it is actually reached. */
const MOCK_ANSWER = 'This is a mock AI response for e2e testing.';

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

async function ask(
  page: import('@playwright/test').Page,
  question: string,
): Promise<void> {
  await page.goto(ROUTES.newChat);
  await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
  await page.locator('textarea').fill(question);
  await page.locator('textarea').press('Enter');
}

test.describe('the seeded fixtures are what this spec assumes', () => {
  test('a BLOCK rule and a LOG rule are enabled', async () => {
    // The guard on the guard. Without it, a seed that stopped creating these
    // would make every assertion below pass for the wrong reason: no rule
    // means no refusal, which is what three of these tests assert the absence
    // of.
    type Fixture = { action: string; enabled: boolean; pattern: string };
    const rules = await withPrisma<Fixture[]>((prisma) =>
      prisma.guardrail.findMany({
        where: { name: { startsWith: 'E2E guardrail' } },
        select: { action: true, enabled: true, pattern: true },
      }),
    );

    expect(rules).toHaveLength(2);
    expect(
      rules.every((rule) => rule.enabled),
      'a disabled fixture would make the refusal tests pass vacuously',
    ).toBe(true);
    expect(rules.map((rule) => rule.pattern).sort()).toEqual([BLOCKED, LOGGED]);
  });
});

test.describe('a guardrail refuses a turn', () => {
  test('a BLOCK rule produces the localized refusal', async ({ page }) => {
    await ask(page, `Pytanie z ${BLOCKED} w środku`);

    // The message the user sees is the localized one, not a code and not
    // "inappropriate content" — a pattern about invoice numbers has no
    // business making that claim.
    await expect(page.getByText(REFUSAL)).toBeVisible({ timeout: 20_000 });
  });

  test('the refused turn produces no assistant answer', async ({ page }) => {
    await ask(page, `Drugie pytanie, ${BLOCKED}`);

    await expect(page.getByText(REFUSAL)).toBeVisible({ timeout: 20_000 });
    // The mock LLM's absence is the assertion: the turn was refused before the
    // chain reached a model, not after it produced something.
    await expect(page.getByText(MOCK_ANSWER)).toHaveCount(0);
  });

  test('the refusal is recorded, without the matched text', async ({
    page,
  }) => {
    await ask(page, `Trzecie pytanie, ${BLOCKED}`);
    await expect(page.getByText(REFUSAL)).toBeVisible({ timeout: 20_000 });

    // `recordSecurityEvent` is fire-and-forget, so the row lands shortly after
    // the response. Polled rather than slept on.
    await expect
      .poll(
        () =>
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
    expect(JSON.stringify(event?.metadata)).not.toContain(BLOCKED);
  });
});

test.describe('a LOG rule observes and nothing else', () => {
  test('the turn is not refused', async ({ page }) => {
    await ask(page, `Pytanie z ${LOGGED} w środku`);

    // Observation mode is the creation default and has to be genuinely
    // observational: a rule that starts by blocking is a rule whose
    // false-positive rate nobody has measured.
    await expect(page.getByText(REFUSAL)).toHaveCount(0);
    await expect(page).toHaveURL(/\/chats\/.+/, { timeout: 20_000 });
  });
});

test.describe('an ordinary turn', () => {
  test('matches no rule and is not refused', async ({ page }) => {
    // The control. Without it, a refusal caused by something else entirely —
    // a usage ceiling, a bad model name — would read as the guardrail working,
    // and an *absent* refusal in the LOG test above would prove nothing.
    await ask(page, 'Zwyczajne pytanie bez żadnego wzorca');

    await expect(page.getByText(REFUSAL)).toHaveCount(0);
  });
});
