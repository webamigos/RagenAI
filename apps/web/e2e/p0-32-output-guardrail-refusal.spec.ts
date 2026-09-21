import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

/**
 * Longer than the suite's 30 s default, because a turn here is a real one.
 *
 * **Raising an assertion's own timeout past this would do nothing** — the test
 * dies at the file's timeout first, so the two have to move together.
 */
test.describe.configure({ timeout: 90_000 });

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
/** The seeded rule's name, which is what `recordGuardrailHit` files under. */
const OUTPUT_FIXTURE_NAME = 'E2E guardrail OUTPUT BLOCK';

/** The Polish string behind `assistant.chat.guardrail-blocked-answer`. */
const WITHHELD_NOTICE = /Odpowiedź została wstrzymana/i;
/** What `mock-llm-server.ts` answers with whenever it is actually reached. */
const MOCK_ANSWER = 'This is a mock AI response for e2e testing.';

/** `assistant.knowledge-scope.label` in Polish — the selector's own name. */
const SCOPE_LABEL = 'Wiedza';
/** `assistant.knowledge-scope.model-only`: the scope that skips retrieval. */
const MODEL_ONLY_OPTION = 'Sam model';

/**
 * How long a turn may take before an assertion gives up.
 *
 * Measured rather than guessed: a turn costs a few seconds once the mock
 * answers the rephraser's structured request, and took fifteen before it did.
 */
const TURN_TIMEOUT = 45_000;

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

/**
 * Ask a question the knowledge base is never consulted for.
 *
 * The e2e job has no Qdrant service, so a turn that reaches retrieval dies
 * with `TypeError: fetch failed` and produces no answer — and an output rule
 * needs an answer to read. `MODEL_ONLY` is the smallest way to get one:
 * `scopeRetrieves()` is false, so the chain goes straight to the model.
 *
 * Giving the suite a vector store is the larger fix and is deliberately not
 * this one; see `docs/lessons/the-e2e-suite-has-never-answered-a-chat-turn.md`.
 */
async function ask(
  page: import('@playwright/test').Page,
  question: string,
): Promise<void> {
  await page.goto(ROUTES.newChat);
  await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

  // By role rather than by test id: this control carries an `aria-label` and
  // its options are real `role="option"` buttons, which is what a screen
  // reader uses and therefore what is worth depending on.
  await page.getByRole('button', { name: SCOPE_LABEL }).click();
  await page.getByRole('option', { name: MODEL_ONLY_OPTION }).click();
  await expect(page.getByRole('button', { name: SCOPE_LABEL })).toContainText(
    MODEL_ONLY_OPTION,
  );

  await page.locator('textarea').fill(question);
  await page.locator('textarea').press('Enter');
}

/**
 * The thread this turn created, from the URL the app navigated to.
 *
 * Every database assertion is scoped by it. Reading "the newest row" instead
 * is how a test comes to report on its own previous attempt: the unscoped
 * version passed on a Playwright retry **in 1.4 seconds**, against the row the
 * failed attempt had written. The suite shares one database across specs and
 * does not truncate between them.
 */
async function threadIdFromUrl(
  page: import('@playwright/test').Page,
): Promise<string> {
  await page.waitForURL(/\/chats\/[^/]+/, { timeout: TURN_TIMEOUT });
  const match = /\/chats\/([^/?#]+)/.exec(page.url());
  if (!match) {
    throw new Error(`no thread id in ${page.url()}`);
  }
  return match[1];
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
  test('the reader is told, and none of the answer reaches the screen', async ({
    page,
  }) => {
    // One turn for both halves. They are one behaviour — the answer is taken
    // back *and* the reason is shown — and as two tests they were two turns,
    // which is how a spec starts timing out for reasons unrelated to what it
    // asserts.
    await ask(page, `Odpowiedz i wpleć ${WITHHELD} w odpowiedź`);

    await expect(page.getByText(WITHHELD_NOTICE)).toBeVisible({
      timeout: TURN_TIMEOUT,
    });

    // Asserted on the mock's sentence and **not** on the token. The token is
    // in the question the reader typed, which is on screen for the obvious
    // reason — an earlier version asserted `getByText(WITHHELD)` had count 0
    // and failed against three matches: the message, the thread title and the
    // sidebar. An assertion that cannot be true fails for a reason that has
    // nothing to do with the rule.
    await expect(page.getByText(MOCK_ANSWER)).toHaveCount(0);
  });

  test('the thread stores the refusal and not the answer', async ({ page }) => {
    // The half that outlives the request, and the one D1 exists for. A
    // partial answer persisted here would be exactly the text the rule
    // stopped, sitting in the thread where nobody would look for it again.
    await ask(page, `Trzecie pytanie, wpleć ${WITHHELD}`);
    await expect(page.getByText(WITHHELD_NOTICE)).toBeVisible({
      timeout: TURN_TIMEOUT,
    });

    const threadId = await threadIdFromUrl(page);
    const lastAnswer = () =>
      withPrisma(
        (prisma): Promise<{ content: string; metadata: unknown } | null> =>
          prisma.message.findFirst({
            where: { role: 'ASSISTANT', threadId },
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
      timeout: TURN_TIMEOUT,
    });

    await expect
      .poll(() => blockedEventCount(), { timeout: 20_000 })
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

/**
 * The control this spec does **not** have, and why.
 *
 * It would assert that an answer nothing matches still reaches the screen —
 * the counterweight that separates a funnel withholding the right answer from
 * one swallowing every answer. It is not here because it depends on the part
 * of the harness this change did not fix: there is still no vector store, and
 * the answer a turn renders depends on which model the picker has got to.
 * `p0-23` and `p0-24` assert rendering against a canned SSE response, which is
 * what keeps that half honest today.
 *
 * What covers it here instead: `createOutputStage` releases unmatched text
 * unchanged, asserted in the package, and `mapFullStream` returns its own
 * iterator unwrapped when an organization has no output rules.
 */
