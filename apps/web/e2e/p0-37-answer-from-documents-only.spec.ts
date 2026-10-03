import { randomUUID } from 'node:crypto';

import { test, expect, type Page } from '@playwright/test';

import { AUTH_FILE, TEST_ORG_ID, TEST_USER_ID } from './constants';

test.use({ storageState: AUTH_FILE });

/** Longer than the suite's default: the last test runs a real turn. */
test.describe.configure({ mode: 'serial', timeout: 90_000 });

/**
 * A chatbot-enabled assistant answers only from its documents (spec
 * 2026-10-03-retrieval-claims-match-the-product-before-launch, Phase C2).
 *
 * `p0`, not `p1`: an assistant behind a customer's public chatbot answering
 * from general knowledge is the failure this change exists to prevent, and a
 * `p1` would not gate the pull request that brings it back.
 *
 * **What gates in CI, and what cannot yet.** The e2e job has no vector store
 * (`.github/workflows/e2e.yml`, and
 * `docs/lessons/the-e2e-suite-has-never-answered-a-chat-turn.md`), and strict
 * grounding applies only to a turn that searches the assistant's documents —
 * a turn that reaches retrieval there dies with `fetch failed` before the
 * answer model is called. So:
 *
 * - the setting is asserted end to end everywhere: the effective default a
 *   chatbot-enabled assistant shows, the opposite default for one without the
 *   chatbot, and a change persisting through apps/api to the column;
 * - the turn — an out-of-corpus question refused, with no citation marker —
 *   runs wherever a Qdrant answers, and skips with that reason where none
 *   does. It is written now so that it starts gating the day the job gets a
 *   vector store, rather than being remembered then.
 *
 * **Why the turn asserts the mock's refusal.** `mock-llm-server.ts` cannot
 * judge whether documents cover a question; it answers one canned sentence.
 * It does answer with a refusal when the prompt carries the strict grounding
 * rule, the way a compliant model would, so seeing the refusal on screen is
 * proof the strict rule reached the answer model's system prompt for this
 * assistant — and the control (the same question to an assistant without the
 * chatbot) proves the mock is not refusing everything. The assertion is on
 * the refusal and the missing citation, not on how a real model would word
 * it; the guard corpus (C1/C3) measures that.
 *
 * Everything here is created and removed by this file. Specs run one at a
 * time, and no other spec has a chatbot-enabled assistant, so no other turn
 * meets the strict rule.
 */

/** `projects.project-view.answer-from-documents-only.*` in Polish. */
const SWITCH_NAME = 'Odpowiadaj tylko na podstawie dokumentów';
const NOTE_DEFAULT_CHATBOT = /Domyślnie dla tego asystenta: włączone/;
const NOTE_DEFAULT_PANEL = /Domyślnie dla tego asystenta: wyłączone/;
const NOTE_SET = /Ustawione dla tego asystenta/;

/** What `mock-llm-server.ts` answers a prompt carrying the strict rule. */
const STRICT_REFUSAL =
  'The documents available to this assistant do not cover this question.';
/** What it answers otherwise. */
const MOCK_ANSWER = 'This is a mock AI response for e2e testing.';
const OUT_OF_CORPUS_QUESTION = 'Jaka jest stolica Australii?';
const TURN_TIMEOUT = 45_000;

const CHATBOT_ASSISTANT = {
  id: randomUUID(),
  title: 'E2E asystent z chatbotem',
  chatbotEnabled: true,
};
const PANEL_ASSISTANT = {
  id: randomUUID(),
  title: 'E2E asystent bez chatbota',
  chatbotEnabled: false,
};

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

async function storedSetting(projectId: string): Promise<boolean | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.projectSettings.findUnique({
      where: { projectId },
      select: { answerFromDocumentsOnly: true },
    });
    return row?.answerFromDocumentsOnly ?? null;
  });
}

async function openAssistant(page: Page, projectId: string) {
  await page.goto(`/pl/projects/${projectId}`);
  const toggle = page.getByRole('switch', { name: SWITCH_NAME });
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  return toggle;
}

/** Whether a vector store answers where the app will look for one. */
async function vectorStoreReachable(): Promise<boolean> {
  const url = process.env.QDRANT_URL || 'http://localhost:6333';
  try {
    const response = await fetch(`${url.replace(/\/$/, '')}/healthz`, {
      signal: AbortSignal.timeout(2_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

test.beforeAll(async () => {
  await withPrisma(async (prisma) => {
    for (const assistant of [CHATBOT_ASSISTANT, PANEL_ASSISTANT]) {
      await prisma.project.create({
        data: {
          id: assistant.id,
          title: assistant.title,
          organizationId: TEST_ORG_ID,
          ownerId: TEST_USER_ID,
          chatbotEnabled: assistant.chatbotEnabled,
        },
      });
    }
  });
});

test.beforeEach(async () => {
  // Every test starts from "nobody has set it", which is what an existing
  // assistant looks like on the day this deploys.
  await withPrisma((prisma) =>
    prisma.projectSettings.deleteMany({
      where: { projectId: { in: [CHATBOT_ASSISTANT.id, PANEL_ASSISTANT.id] } },
    }),
  );
});

test.afterAll(async () => {
  await withPrisma(async (prisma) => {
    // In the seed's own order: messages and usage rows do not cascade from
    // their thread or project, so a turn's rows would otherwise block the
    // delete.
    const ids = [CHATBOT_ASSISTANT.id, PANEL_ASSISTANT.id];
    await prisma.threadPublicLink.deleteMany({
      where: { thread: { projectId: { in: ids } } },
    });
    await prisma.message.deleteMany({
      where: { thread: { projectId: { in: ids } } },
    });
    await prisma.thread.deleteMany({ where: { projectId: { in: ids } } });
    await prisma.aiUsage.deleteMany({ where: { projectId: { in: ids } } });
    await prisma.project.deleteMany({ where: { id: { in: ids } } });
  });
});

test.describe('the setting', () => {
  test('a chatbot-enabled assistant is strict by default, and says why', async ({
    page,
  }) => {
    const toggle = await openAssistant(page, CHATBOT_ASSISTANT.id);

    await expect(toggle).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByText(NOTE_DEFAULT_CHATBOT)).toBeVisible();
    // A default, not a stored choice: nothing was written to show it.
    expect(await storedSetting(CHATBOT_ASSISTANT.id)).toBeNull();
  });

  test('an assistant without the chatbot keeps today’s rule by default', async ({
    page,
  }) => {
    const toggle = await openAssistant(page, PANEL_ASSISTANT.id);

    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText(NOTE_DEFAULT_PANEL)).toBeVisible();
  });

  test('turning it off on a chatbot-enabled assistant is stored and survives a reload', async ({
    page,
  }) => {
    const toggle = await openAssistant(page, CHATBOT_ASSISTANT.id);
    await toggle.click();

    await expect
      .poll(() => storedSetting(CHATBOT_ASSISTANT.id), { timeout: 15_000 })
      .toBe(false);

    const reloaded = await openAssistant(page, CHATBOT_ASSISTANT.id);
    await expect(reloaded).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByText(NOTE_SET)).toBeVisible();
  });
});

test.describe('the mock reports the rule, or the turn below tests nothing', () => {
  test('a prompt carrying the strict rule is refused, and one without it is not', async ({
    request,
  }) => {
    // Runs in CI even though the turn below cannot: if the mock stopped
    // recognising the rule, the turn would fail as if the application had
    // dropped it, and if it refused everything, the control would be the only
    // thing to say so.
    const port = process.env.MOCK_LLM_PORT ?? '4100';
    const ask = (system: string) =>
      request.post(`http://localhost:${port}/v1/chat/completions`, {
        data: {
          stream: false,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: OUT_OF_CORPUS_QUESTION },
          ],
        },
      });

    const strict = await ask(
      '- If neither the context nor a document or image attached to the message contains the answer, say that the documents do not cover it, and do not answer from general knowledge.',
    );
    expect((await strict.json()).choices[0].message.content).toBe(
      STRICT_REFUSAL,
    );

    const lenient = await ask(
      '- If the answer is not directly in the provided context but you believe you know the answer, explain this to the user.',
    );
    expect((await lenient.json()).choices[0].message.content).toBe(MOCK_ANSWER);
  });
});

test.describe('an out-of-corpus question', () => {
  test.beforeEach(async () => {
    test.skip(
      !(await vectorStoreReachable()),
      'No vector store answers here (the CI e2e job runs none), and strict grounding applies only to a turn that retrieves — see this file’s header.',
    );
  });

  async function askOnAssistantPage(page: Page, projectId: string) {
    await page.goto(`/pl/projects/${projectId}`);
    const composer = page.locator('textarea').first();
    await expect(composer).toBeVisible({ timeout: 15_000 });
    await composer.fill(OUT_OF_CORPUS_QUESTION);
    await composer.press('Enter');
  }

  test('a chatbot-enabled assistant refuses it, with no citation', async ({
    page,
  }) => {
    await askOnAssistantPage(page, CHATBOT_ASSISTANT.id);

    const conversation = page.locator('main');
    await expect(conversation.getByText(STRICT_REFUSAL)).toBeVisible({
      timeout: TURN_TIMEOUT,
    });
    await expect(conversation.getByText(MOCK_ANSWER)).toHaveCount(0);
    // No citation marker in the answer and no sources to open: a statement
    // of absence cites nothing (the citation rule in the same prompt).
    await expect(conversation.getByText(/\[\d+\]/)).toHaveCount(0);
    await expect(page.getByTestId('sources-rail-toggle')).toHaveCount(0);
  });

  test('the control: an assistant without the chatbot is not told to refuse', async ({
    page,
  }) => {
    await askOnAssistantPage(page, PANEL_ASSISTANT.id);

    const conversation = page.locator('main');
    await expect(conversation.getByText(MOCK_ANSWER)).toBeVisible({
      timeout: TURN_TIMEOUT,
    });
    await expect(conversation.getByText(STRICT_REFUSAL)).toHaveCount(0);
  });
});
