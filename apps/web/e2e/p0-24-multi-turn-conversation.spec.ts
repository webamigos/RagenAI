import { test, expect } from '@playwright/test';

import { AUTH_FILE, TEST_THREAD_ID } from './constants';
import { ROUTES, mockChatStreamSequence } from './helpers';

test.use({ storageState: AUTH_FILE });

// The client's request body doesn't carry prior chat history (the server
// loads it from the DB via threadId, see mockChatStreamSequence's doc
// comment) — so "context continuity" here means: does sending a *second*
// message wipe the first exchange from the screen, which would happen if
// the accumulation logic (`setMessages([...messages, newOne])`) captured a
// stale `messages` snapshot from before the first turn's response arrived.
test.describe('Multi-turn conversation (mocked stream)', () => {
  test('two sequential messages in the same thread both stay visible', async ({
    page,
  }) => {
    const FIRST_RESPONSE = 'This is the first mocked assistant reply.';
    const SECOND_RESPONSE = 'This is the second mocked assistant reply.';

    await mockChatStreamSequence(page, [
      {
        userMessageId: 'mock-user-msg-turn-1',
        assistantMessageId: 'mock-assistant-msg-turn-1',
        content: FIRST_RESPONSE,
      },
      {
        userMessageId: 'mock-user-msg-turn-2',
        assistantMessageId: 'mock-assistant-msg-turn-2',
        content: SECOND_RESPONSE,
      },
    ]);

    await page.goto(`${ROUTES.chats}/${TEST_THREAD_ID}`);
    await expect(page.locator('textarea')).toBeVisible({ timeout: 10_000 });

    // Prior seeded messages must be loaded before either new turn starts.
    await expect(
      page.getByText('Hello, this is a seeded test message.'),
    ).toBeVisible({ timeout: 10_000 });

    const firstMessage = 'First follow-up question.';
    await page.locator('textarea').fill(firstMessage);
    await page.locator('textarea').press('Enter');

    await expect(page.getByText(firstMessage)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(FIRST_RESPONSE)).toBeVisible({
      timeout: 30_000,
    });

    // Second turn — sent only after the first has fully rendered, so a
    // failure here isolates the accumulation logic, not stream timing.
    const secondMessage = 'Second follow-up question, same thread.';
    await page.locator('textarea').fill(secondMessage);
    await page.locator('textarea').press('Enter');

    await expect(page.getByText(secondMessage)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(SECOND_RESPONSE)).toBeVisible({
      timeout: 30_000,
    });

    // The whole point: both turns (plus the original seeded pair) must
    // still be on screen — sending #2 must not have dropped #1.
    await expect(page.getByText(firstMessage)).toBeVisible();
    await expect(page.getByText(FIRST_RESPONSE)).toBeVisible();
    await expect(
      page.getByText('Hello, this is a seeded test message.'),
    ).toBeVisible();
  });
});
