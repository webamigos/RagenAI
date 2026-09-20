import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

/**
 * An `OUTPUT` rule withholds an answer, and the thread keeps the refusal
 * rather than the answer.
 *
 * `p0` for the reason `p0-29` gives: a `p1` does not gate the pull request
 * that breaks it, and this feature's failure mode is silence. Phase D's own
 * version of that silence is narrower and worse than the input stage's — an
 * output rule can be enforced on the surfaces that read `fullStream` and on
 * no other, which is exactly what D1c found and closed. A rule enforced in
 * some places looks, from every screen a person can open, like a rule that
 * works.
 *
 * **The fixture matches what the mock echoes, not what it always says.**
 * `mock-llm-server.ts` answers every prompt with one sentence, so a rule
 * matching that sentence would refuse every chat spec in the suite. A prompt
 * carrying `zzqx-echo-<token>` gets the token back in the answer, so the
 * seeded `OUTPUT` fixture can match an answer that only this file asks for.
 *
 * Deliberately **not** mocking the chat stream, like `p0-29` and `p0-27`:
 * every other chat spec routes the threads API to a canned SSE response,
 * which would sail straight past the funnel under test.
 */

/** What the seeded OUTPUT fixture matches. Only this spec asks for it. */
const WITHHELD = 'zzqx-echo-withheld';
/** An echo nothing matches, for the control. */
const HARMLESS = 'zzqx-echo-ordinary';
/** The seeded rule's name, which is what `recordGuardrailHit` files under. */
const OUTPUT_FIXTURE_NAME = 'E2E guardrail OUTPUT BLOCK';

/** The Polish string behind `assistant.chat.guardrail-blocked-answer`. */
const WITHHELD_NOTICE = /Odpowiedź została wstrzymana/i;
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

/**
 * How many blocks this fixture has caused, not how many exist.
 *
 * `p0-29` blocks on the *input* side several times in the same run, so a count
 * over the event type alone would rise without this rule having fired at all —
 * and the poll below would be satisfied by somebody else's row while the
 * output funnel did nothing.
 */
async function blockedEventCount(): Promise<number> {
  return withPrisma((prisma) =>
    prisma.securityEvent.count({
      where: {
        eventType: 'GUARDRAIL_BLOCKED',
        metadata: { path: ['rule'], equals: OUTPUT_FIXTURE_NAME },
      },
    }),
  );
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

test.describe('the seeded output fixture is what this spec assumes', () => {
  test('an OUTPUT BLOCK rule is enabled', async () => {
    // The guard on the guard. Without it, a seed that stopped creating this
    // would make the refusal test below pass for the wrong reason — no rule
    // means no refusal, and "no refusal appeared" is what two of these tests
    // assert.
    type Fixture = { action: string; enabled: boolean; pattern: string };
    const rule = await withPrisma<Fixture | null>((prisma) =>
      prisma.guardrail.findFirst({
        where: { name: OUTPUT_FIXTURE_NAME },
        select: { action: true, enabled: true, pattern: true },
      }),
    );

    expect(rule).not.toBeNull();
    expect(rule?.enabled).toBe(true);
    expect(rule?.action).toBe('BLOCK');
    expect(rule?.pattern).toBe(WITHHELD);
  });

  test('the mock echoes a requested token, or this spec tests nothing', async ({
    request,
  }) => {
    // The fixture matches an answer the mock only produces on request. If the
    // echo stopped working, every assertion below would describe an answer
    // that never contained the token — and the refusal tests would fail
    // confusingly while the control passed.
    const port = process.env.MOCK_LLM_PORT ?? '4100';
    const response = await request.post(
      `http://localhost:${port}/v1/chat/completions`,
      {
        data: {
          stream: false,
          messages: [{ role: 'user', content: `echo ${WITHHELD} back` }],
        },
      },
    );

    expect(response.ok()).toBe(true);
    const body = await response.json();
    expect(body.choices[0].message.content).toContain(WITHHELD);
  });
});

test.describe('an output guardrail withholds the answer', () => {
  test('the reader is told, in their own language', async ({ page }) => {
    await ask(page, `Odpowiedz i wpleć ${WITHHELD} w odpowiedź`);

    await expect(page.getByText(WITHHELD_NOTICE)).toBeVisible({
      timeout: 20_000,
    });
  });

  test('none of the withheld answer reaches the screen', async ({ page }) => {
    await ask(page, `Drugie pytanie, wpleć ${WITHHELD}`);

    await expect(page.getByText(WITHHELD_NOTICE)).toBeVisible({
      timeout: 20_000,
    });
    // The model did answer — it was reached, billed and its answer stopped at
    // the funnel. So the assertion is about what the reader ends up looking
    // at, not about whether a model ran: the streamed prefix is taken back
    // and the mock's sentence is nowhere on the page.
    await expect(page.getByText(MOCK_ANSWER)).toHaveCount(0);
    await expect(page.getByText(WITHHELD)).toHaveCount(0);
  });

  test('the thread stores the refusal and not the answer', async ({ page }) => {
    // The half that outlives the request, and the one D1 exists for. A
    // partial answer persisted here would be exactly the text the rule
    // stopped, sitting in the thread where nobody would look for it again.
    await ask(page, `Trzecie pytanie, wpleć ${WITHHELD}`);
    await expect(page.getByText(WITHHELD_NOTICE)).toBeVisible({
      timeout: 20_000,
    });

    const lastAnswer = () =>
      withPrisma(
        (prisma): Promise<{ content: string; metadata: unknown } | null> =>
          prisma.message.findFirst({
            where: { role: 'ASSISTANT' },
            orderBy: { createdAt: 'desc' },
            select: { content: true, metadata: true },
          }),
      );

    // The marker is what the panel localizes off, and what says a refusal was
    // stored rather than an answer that happens to read like one. Polled
    // because the row lands as the stream closes.
    await expect
      .poll(async () => JSON.stringify((await lastAnswer())?.metadata ?? {}), {
        timeout: 15_000,
      })
      .toContain('guardrailBlocked');

    const stored = await lastAnswer();

    // Asserted **positively**, on purpose. "The content does not contain the
    // token" is true of ciphertext too, so on an installation with thread
    // encryption on it would pass while proving nothing. Requiring the
    // refusal's own words fails loudly there instead, which is the failure
    // that gets fixed rather than the one that gets trusted.
    expect(stored?.content).toContain('withheld because it matched a rule');
    expect(stored?.content).not.toContain(WITHHELD);
    expect(stored?.content).not.toContain(MOCK_ANSWER);
  });

  test('the block is recorded, without the matched text', async ({ page }) => {
    const before = await blockedEventCount();

    await ask(page, `Czwarte pytanie, wpleć ${WITHHELD}`);
    await expect(page.getByText(WITHHELD_NOTICE)).toBeVisible({
      timeout: 20_000,
    });

    await expect
      .poll(() => blockedEventCount(), { timeout: 15_000 })
      .toBeGreaterThan(before);

    // Scoped to this fixture rather than to the newest row: `p0-29` blocks on
    // the input side and would otherwise supply the row this assertion then
    // clears.
    const event = await withPrisma(
      (prisma): Promise<{ metadata: unknown } | null> =>
        prisma.securityEvent.findFirst({
          where: {
            eventType: 'GUARDRAIL_BLOCKED',
            metadata: { path: ['rule'], equals: OUTPUT_FIXTURE_NAME },
          },
          orderBy: { createdAt: 'desc' },
          select: { metadata: true },
        }),
    );

    expect(
      event,
      'no event for the seeded OUTPUT fixture — the count above was satisfied by someone else’s row',
    ).not.toBeNull();
    expect(JSON.stringify(event?.metadata)).toContain('"stage":"OUTPUT"');
    // The matched span is the answer, which this table renders in plain text
    // in the admin panel for every operator.
    expect(JSON.stringify(event?.metadata)).not.toContain(WITHHELD);
  });
});

test.describe('an answer nothing matches', () => {
  test('is shown, and streams as it always did', async ({ page }) => {
    // The control, and it does more work here than in `p0-29`: without it, an
    // output funnel that swallowed every answer would look identical to one
    // that withheld the right one. It also says the echo itself is not what
    // triggers the rule — this answer carries a token too.
    await ask(page, `Zwykłe pytanie, wpleć ${HARMLESS}`);

    await expect(page.getByText(MOCK_ANSWER)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(WITHHELD_NOTICE)).toHaveCount(0);
  });
});
