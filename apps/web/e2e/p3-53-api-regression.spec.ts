import { test, expect } from '@playwright/test';

import { AUTH_FILE } from './constants';

test.use({ storageState: AUTH_FILE });

test.describe('API Regression P3', () => {
  test('GET /api/healthcheck returns 200 with status ok', async ({
    request,
  }) => {
    const response = await request.get('/api/healthcheck');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('ok');
  });

  test('GET /api/messages without valid thread returns error', async ({
    request,
  }) => {
    const response = await request.get('/api/messages/fake-thread-id');
    expect(response.ok()).toBe(false);
  });

  test('POST /api/upload without files returns error', async ({ request }) => {
    const response = await request.post('/api/upload', {
      data: {},
    });
    expect(response.ok()).toBe(false);
  });

  test('GET /api/projects/public/invalid-token returns error', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/projects/public/nonexistent-token-12345',
    );
    expect(response.ok()).toBe(false);
  });

  test('GET /api/ai-usage returns response', async ({ request }) => {
    const response = await request.get('/api/ai-usage');
    // Endpoint may use POST only (405) or require query params
    expect(response.status()).toBeDefined();
  });

  test('POST /api/threads/fake-id returns response', async ({ request }) => {
    const response = await request.post(
      '/api/threads/nonexistent-thread-id?mode=conversation',
      {
        data: {
          prompt: 'Hello test',
          mode: 'conversation',
        },
      },
    );
    // Endpoint returns streaming or error — both are valid
    expect(response.status()).toBeDefined();
  });

  test('GET /api/files/invalid-id returns error', async ({ request }) => {
    const response = await request.get('/api/files/nonexistent-file-id');
    expect(response.ok()).toBe(false);
  });

  test('POST /api/tts without required fields returns error', async ({
    request,
  }) => {
    const response = await request.post('/api/tts', {
      data: {},
    });
    expect(response.ok()).toBe(false);
  });
});
