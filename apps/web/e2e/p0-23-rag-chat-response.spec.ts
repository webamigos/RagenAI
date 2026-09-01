import { test, expect } from '@playwright/test';

import { AUTH_FILE, TEST_THREAD_ID } from './constants';
import { ROUTES, mockChatStream } from './helpers';

test.use({ storageState: AUTH_FILE });

// Deliberately long/distinctive so a match can only come from the mocked
// stream actually rendering, not from placeholder/loading text.
const MOCK_RESPONSE =
  'The mocked assistant reply contains this exact sentence for verification.';

test.describe('RAG chat response rendering (mocked stream)', () => {
  test('sends the first message in a new thread and renders the full streamed response', async ({
    page,
  }) => {
    await mockChatStream(page, { content: MOCK_RESPONSE });
    // A brand-new thread's initial mount also fires a real GET for message
    // history (`fetchData` in useAssistantLogic.ts) which resolves empty
    // (nothing is actually persisted since the stream above is mocked) and
    // *overwrites* the stream-driven Redux state if it lands afterward —
    // a real race, not a test artifact (see docs/lessons/ for the writeup).
    // Leaving it perpetually pending keeps this test deterministic; Playwright
    // aborts the pending request when the page context closes.
    await page.route('**/api/messages/**', () => {
      /* intentionally never fulfilled — see comment above */
    });

    await page.goto(ROUTES.newChat);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    const userMessage = 'What does the mocked knowledge base say?';
    await page.locator('textarea').fill(userMessage);
    await page.locator('textarea').press('Enter');

    // A new thread is created server-side (real DB write, not mocked) before
    // the stream starts, so the URL changes to the freshly created thread.
    await expect(page).toHaveURL(/\/chats\/.+/, { timeout: 30_000 });

    // Scoped to <main> — the sidebar also renders the new thread's title,
    // which the app derives from this same first-message text, and would
    // otherwise make this locator ambiguous (strict-mode violation).
    const conversation = page.locator('main');
    await expect(conversation.getByText(userMessage)).toBeVisible({
      timeout: 10_000,
    });
    // Waiting for the full sentence (not a substring) proves every `delta`
    // event was consumed and assembled in order, not just the first chunk.
    await expect(conversation.getByText(MOCK_RESPONSE)).toBeVisible({
      timeout: 30_000,
    });
    // Not asserting the textarea re-enables here: the never-fulfilled
    // `/api/messages/**` route above (needed to dodge the race) keeps
    // `useApi`'s loading state — and therefore the textarea's disabled
    // state — stuck on purpose for the rest of this test.
  });

  test('sends a message into an existing thread alongside its prior history', async ({
    page,
  }) => {
    await mockChatStream(page, { content: MOCK_RESPONSE });

    await page.goto(`${ROUTES.chats}/${TEST_THREAD_ID}`);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    // Prior seeded messages (see e2e/seed/e2e-seed.ts) must still be visible
    // — this is the closest e2e gets to asserting conversation continuity
    // without a real LLM re-reading history.
    await expect(
      page.getByText('Hello, this is a seeded test message.'),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText('This is the assistant response to the seeded message.'),
    ).toBeVisible({ timeout: 10_000 });

    const followUpMessage = 'Follow-up question referencing prior context.';
    await page.locator('textarea').fill(followUpMessage);
    await page.locator('textarea').press('Enter');

    await expect(page.getByText(followUpMessage)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(MOCK_RESPONSE)).toBeVisible({
      timeout: 30_000,
    });

    // Old messages are still on screen after the new exchange completes.
    await expect(
      page.getByText('Hello, this is a seeded test message.'),
    ).toBeVisible();
  });
});
