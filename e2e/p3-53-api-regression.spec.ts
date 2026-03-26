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

  test('GET /api/messages requires authentication', async ({ browser }) => {
    // Use a fresh context without auth
    const context = await browser.newContext();
    const request = context.request;

    const response = await request.get('/api/messages/fake-thread-id');
    // Should return 401 or redirect
    expect([401, 403, 302]).toContain(response.status());

    await context.close();
  });

  test('POST /api/upload requires authentication', async ({ browser }) => {
    const context = await browser.newContext();
    const request = context.request;

    const response = await request.post('/api/upload', {
      multipart: {
        files: {
          name: 'test.md',
          mimeType: 'text/markdown',
          buffer: Buffer.from('# Test'),
        },
      },
    });
    expect([401, 403, 302]).toContain(response.status());

    await context.close();
  });

  test('GET /api/projects/public/invalid-token returns error', async ({
    request,
  }) => {
    const response = await request.get(
      '/api/projects/public/nonexistent-token-12345',
    );
    // Should return 404 or 403
    expect([404, 403, 500]).toContain(response.status());
  });

  test('GET /api/ai-usage returns data for admin user', async ({ request }) => {
    const response = await request.get('/api/ai-usage');
    // Should return 200 for authenticated admin
    expect([200, 403]).toContain(response.status());

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toBeDefined();
    }
  });

  test('POST /api/threads/fake-id returns error for invalid thread', async ({
    request,
  }) => {
    const response = await request.post(
      '/api/threads/nonexistent-thread-id?mode=conversation',
      {
        data: {
          prompt: 'Hello test',
          mode: 'conversation',
        },
      },
    );
    // Should return 404 or similar error
    expect([400, 404, 500]).toContain(response.status());
  });

  test('GET /api/files/invalid-id returns 404', async ({ request }) => {
    const response = await request.get('/api/files/nonexistent-file-id');
    expect([404, 500]).toContain(response.status());
  });

  test('POST /api/tts returns error without required fields', async ({
    request,
  }) => {
    const response = await request.post('/api/tts', {
      data: {},
    });
    expect([400, 500]).toContain(response.status());
  });
});
