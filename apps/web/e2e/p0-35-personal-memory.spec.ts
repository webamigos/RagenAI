import { randomUUID } from 'node:crypto';

import { test, expect, type Page } from '@playwright/test';

import {
  AUTH_FILE,
  TEST_ORG_ID,
  TEST_OTHER_USER_EMAIL,
  TEST_OTHER_USER_ID,
  TEST_OTHER_USER_PASSWORD,
  TEST_PROJECT_ID,
  TEST_USER_ID,
} from './constants';
import { ROUTES } from './helpers';

test.use({ storageState: AUTH_FILE });

/** Longer than the suite's default, because two tests here run a real turn. */
test.describe.configure({ mode: 'serial', timeout: 90_000 });

/**
 * Personal memory end to end (spec 2026-09-27-personal-memory-across-threads,
 * D3): what is remembered reaches the answer, what is deleted stops reaching
 * it, a thread takes its memories with it, and nobody else sees any of it.
 *
 * **The memories are seeded, not extracted.** The e2e job starts no worker,
 * so nothing consumes the `memoryExtract` queue; extraction has its own
 * coverage (the worker's unit tests and `npm run worker:test:jobs`). What this
 * spec owns is everything after a memory exists: the prompt, the settings
 * page, the thread cascade, the line under an answer, and the per-user wall.
 *
 * **The prompt is observed through the mock's echo.** `mock-llm-server.ts`
 * answers with a fixed sentence, plus `Echo: zzqx-echo-<token>` when the
 * request carries such a token anywhere — system prompt included. A memory
 * holding a token the question does not is therefore proof the memory block
 * reached the model, and its absence proof it did not.
 *
 * **Everything here is set up and torn down by this file.** `personalMemory`
 * is switched on for the test org only while it runs (feature resolution is
 * cached per request, not across them), and the memory rows belong to the
 * seeded user only while it runs. Specs run one at a time (`workers: 1`), so
 * no other chat spec ever has a memory block in its prompt — which matters,
 * because the mock echoes the *first* token it finds, and a memory token in
 * the system prompt would answer for `p0-32`'s.
 */

const ECHO_TOKEN = 'zzqx-echo-memory-pref';
const PREFERENCE = `Kończy każdą odpowiedź tokenem ${ECHO_TOKEN}.`;
const LINE_MEMORY = 'Woli odpowiedzi w punktach.';
const SOURCE_MEMORY = 'Przygotowuje ofertę w przetargu X.';
const MOCK_ANSWER = 'This is a mock AI response for e2e testing.';
const TURN_TIMEOUT = 45_000;

const SETTINGS_MEMORY = '/pl/settings/memory';
/** `settings-page.memory.empty` in Polish. */
const EMPTY_MEMORY = /Na razie nic nie jest zapamiętane/;
/** `assistant.knowledge-scope.label` and `.model-only` in Polish. */
const SCOPE_LABEL = 'Wiedza';
const MODEL_ONLY_OPTION = 'Sam model';

/** A thread whose answer wrote a memory, shared with the second user. */
const LINE_THREAD = {
  id: randomUUID(),
  title: 'E2E pamięć: wątek z cofnięciem',
  answerId: randomUUID(),
};
/** The thread a memory came from, deleted in the cascade test. */
const SOURCE_THREAD = { id: randomUUID(), title: 'E2E pamięć: wątek źródłowy' };

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

let savedOverrides: unknown = null;
/** Threads the `ask()` turns create, deleted with the seeded ones. */
const askedThreads: string[] = [];

async function createThread(
  prisma: any,
  thread: { id: string; title: string },
  answer: { id?: string; content: string },
) {
  await prisma.thread.create({
    data: {
      id: thread.id,
      title: thread.title,
      organizationId: TEST_ORG_ID,
      userId: TEST_USER_ID,
      visitorId: TEST_USER_ID,
      projectId: TEST_PROJECT_ID,
    },
  });
  await prisma.message.create({
    data: {
      content: 'Wolę odpowiedzi w punktach.',
      role: 'USER',
      thread: { connect: { id: thread.id } },
    },
  });
  await prisma.message.create({
    data: {
      ...(answer.id ? { id: answer.id } : {}),
      content: answer.content,
      role: 'ASSISTANT',
      thread: { connect: { id: thread.id } },
    },
  });
}

test.beforeAll(async () => {
  await withPrisma(async (prisma) => {
    // Overrides live on the org's settings row, which the seed creates.
    const org = await prisma.organizationSettings.findUniqueOrThrow({
      where: { organizationId: TEST_ORG_ID },
      select: { featureOverrides: true },
    });
    savedOverrides = org.featureOverrides;
    await prisma.organizationSettings.update({
      where: { organizationId: TEST_ORG_ID },
      data: {
        featureOverrides: {
          ...((org.featureOverrides as object | null) ?? {}),
          personalMemory: true,
        },
      },
    });

    // A failed earlier run may have left rows behind; profiles cascade to
    // their memories and change rows.
    await prisma.userMemoryProfile.deleteMany({
      where: { organizationId: TEST_ORG_ID },
    });

    await createThread(prisma, LINE_THREAD, {
      id: LINE_THREAD.answerId,
      content: 'Zapamiętam, że wolisz odpowiedzi w punktach.',
    });
    await createThread(prisma, SOURCE_THREAD, {
      content: 'Powodzenia z ofertą.',
    });
    await prisma.threadShare.create({
      data: {
        threadId: LINE_THREAD.id,
        userId: TEST_OTHER_USER_ID,
        sharedByUserId: TEST_USER_ID,
      },
    });

    const owner = { organizationId: TEST_ORG_ID, userId: TEST_USER_ID };
    const profile = await prisma.userMemoryProfile.create({ data: owner });
    const memory = (content: string, sourceThreadId: string | null) =>
      prisma.userMemory.create({
        data: {
          ...owner,
          profileId: profile.id,
          content,
          isEncrypted: false,
          sourceThreadId,
        },
        select: { publicId: true },
      });

    await memory(PREFERENCE, null);
    await memory(SOURCE_MEMORY, SOURCE_THREAD.id);
    const written = await memory(LINE_MEMORY, LINE_THREAD.id);
    await prisma.userMemoryChange.create({
      data: {
        ...owner,
        profileId: profile.id,
        messageId: LINE_THREAD.answerId,
        sourceThreadId: LINE_THREAD.id,
        memoryPublicId: written.publicId,
        operation: 'ADD',
        newContent: LINE_MEMORY,
        isEncrypted: false,
        resultVersion: 1,
      },
    });
  });
});

test.afterAll(async () => {
  await withPrisma(async (prisma) => {
    await prisma.userMemoryProfile.deleteMany({
      where: { organizationId: TEST_ORG_ID },
    });
    await prisma.thread.deleteMany({
      where: {
        id: { in: [LINE_THREAD.id, SOURCE_THREAD.id, ...askedThreads] },
      },
    });
    await prisma.organizationSettings.update({
      where: { organizationId: TEST_ORG_ID },
      data: { featureOverrides: savedOverrides ?? {} },
    });
  });
});

/**
 * Ask a question that skips retrieval, as `p0-32` does: the e2e job has no
 * vector store, and the memory block is in the prompt either way.
 */
async function ask(page: Page, question: string): Promise<void> {
  await page.goto(ROUTES.newChat);
  await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: SCOPE_LABEL }).click();
  await page.getByRole('option', { name: MODEL_ONLY_OPTION }).click();
  await page.locator('textarea').fill(question);
  await page.locator('textarea').press('Enter');
  await expect(page.getByText(MOCK_ANSWER).last()).toBeVisible({
    timeout: TURN_TIMEOUT,
  });
  const match = /\/chats\/([^/?#]+)/.exec(page.url());
  if (match) {
    askedThreads.push(match[1]);
  }
}

async function memoryRow(page: Page, content: string) {
  return page.getByRole('listitem').filter({ hasText: content });
}

test('a remembered preference reaches the answer in a new thread', async ({
  page,
}) => {
  await ask(page, 'Ile to dwa plus dwa?');
  await expect(page.getByText(`Echo: ${ECHO_TOKEN}`).last()).toBeVisible({
    timeout: TURN_TIMEOUT,
  });
});

test('the answer that wrote a memory says so, and undo removes it', async ({
  page,
}) => {
  await page.goto(`/pl/chats/${LINE_THREAD.id}`);
  const line = page.getByRole('listitem').filter({
    hasText: `Zapamiętano: ${LINE_MEMORY}`,
  });
  await expect(line).toBeVisible({ timeout: 15_000 });

  await line.getByRole('button', { name: 'Cofnij' }).click();
  await expect(line).toContainText('Cofnięto', { timeout: 10_000 });

  const left = await withPrisma((prisma) =>
    prisma.userMemory.count({
      where: { organizationId: TEST_ORG_ID, content: LINE_MEMORY },
    }),
  );
  expect(left).toBe(0);
});

test('a second member of the org sees none of it, not even in a thread shared with them', async ({
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

    await page.goto(SETTINGS_MEMORY);
    await expect(page.getByText(EMPTY_MEMORY)).toBeVisible({ timeout: 15_000 });
    for (const text of [PREFERENCE, SOURCE_MEMORY, LINE_MEMORY]) {
      await expect(page.getByText(text)).toHaveCount(0);
    }

    await expect(
      page.getByRole('link', { name: `Thread: ${LINE_THREAD.title}` }),
    ).toBeVisible({ timeout: 15_000 });

    // Opened as the plain member it was shared with, read-only: the seeded
    // answer renders, so the absence of the memory line and the owner's
    // memories below means something.
    await page.goto(`/pl/chats/${LINE_THREAD.id}`);
    await expect(
      page.getByText('Zapamiętam, że wolisz odpowiedzi w punktach.'),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Zapamiętano:/)).toHaveCount(0);
    for (const text of [PREFERENCE, SOURCE_MEMORY, LINE_MEMORY]) {
      await expect(page.getByText(text)).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});

test('deleting the thread a memory came from removes the memory', async ({
  page,
}) => {
  await page.goto(SETTINGS_MEMORY);
  await expect(await memoryRow(page, SOURCE_MEMORY)).toBeVisible({
    timeout: 15_000,
  });

  await page.goto(ROUTES.chats);
  const thread = page
    .locator('[data-testid="thread-item"]')
    .filter({ hasText: SOURCE_THREAD.title });
  await expect(thread).toBeVisible({ timeout: 15_000 });
  await thread.hover();
  await thread.locator('[data-testid="thread-menu-trigger"]').click();
  await page.getByRole('menuitem', { name: /usuń/i }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Usuń' })
    .click();
  await expect(thread).toHaveCount(0, { timeout: 15_000 });

  await page.goto(SETTINGS_MEMORY);
  await expect(page.getByText(PREFERENCE)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(SOURCE_MEMORY)).toHaveCount(0);
});

test('a memory deleted in settings no longer reaches the answer', async ({
  page,
}) => {
  await page.goto(SETTINGS_MEMORY);
  const row = await memoryRow(page, PREFERENCE);
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.getByRole('button', { name: 'Usuń' }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Usuń' })
    .click();
  await expect(page.getByText(PREFERENCE)).toHaveCount(0, { timeout: 10_000 });

  await ask(page, 'Ile to trzy plus trzy?');
  // The answer arrived (ask waits for it); the memory's token did not.
  await expect(page.getByText(`Echo: ${ECHO_TOKEN}`)).toHaveCount(0);
});
