import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn() },
}));

const { POST, OPTIONS } = await import('../route');
const { logger } = await import('@/app/lib/utils/logger');

function makeRequest(body: unknown, origin = 'https://example.com') {
  return new NextRequest('http://localhost/api/chatbot/test-token/error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin },
    body: JSON.stringify(body),
  });
}

describe('POST /api/chatbot/[token]/error', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 204 for valid body', async () => {
    const req = makeRequest({
      message: 'Failed to load config: HTTP 500',
      url: 'https://example.com/page',
      userAgent: 'Mozilla/5.0',
    });
    const res = await POST(req, {
      params: Promise.resolve({ token: 'test-token' }),
    });
    expect(res.status).toBe(204);
  });

  it('logs error with chatbotToken, message, url, userAgent', async () => {
    const req = makeRequest({
      message: 'Failed to load config: HTTP 500',
      url: 'https://example.com/page',
      userAgent: 'Mozilla/5.0',
    });
    await POST(req, { params: Promise.resolve({ token: 'abc-123' }) });
    expect(logger.error).toHaveBeenCalledWith(
      {
        chatbotToken: 'abc-123',
        message: 'Failed to load config: HTTP 500',
        url: 'https://example.com/page',
        userAgent: 'Mozilla/5.0',
      },
      'chatbot-widget error',
    );
  });

  it('returns 204 even for unknown token', async () => {
    const req = makeRequest({
      message: 'some error',
      url: 'https://x.com',
      userAgent: 'bot',
    });
    const res = await POST(req, {
      params: Promise.resolve({ token: 'unknown-token' }),
    });
    expect(res.status).toBe(204);
  });

  it('returns 204 and warns for malformed body', async () => {
    const req = new NextRequest(
      'http://localhost/api/chatbot/test-token/error',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      },
    );
    const res = await POST(req, {
      params: Promise.resolve({ token: 'test-token' }),
    });
    expect(res.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ chatbotToken: 'test-token' }),
      'chatbot-widget error: malformed request body',
    );
  });

  it('returns 204 for missing fields', async () => {
    const req = makeRequest({});
    const res = await POST(req, {
      params: Promise.resolve({ token: 'test-token' }),
    });
    expect(res.status).toBe(204);
  });
});

describe('OPTIONS /api/chatbot/[token]/error', () => {
  it('returns 204 with CORS headers', async () => {
    const res = await OPTIONS();
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });
});
