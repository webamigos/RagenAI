import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockFindUnique = vi.fn();
const mockGetAllSettings = vi.fn();
const mockStream = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    project: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock('@/features/organizations/services/organization-settings', () => ({
  getAllSettings: (...args: unknown[]) => mockGetAllSettings(...args),
}));

vi.mock('@/app/api/threads/services/initializeBasicRag', () => ({
  initializeRagChain: () =>
    Promise.resolve({
      stream: (...args: unknown[]) => mockStream(...args),
    }),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

import { POST } from '../route';

const INTERNAL_SECRET = 'test-internal-secret-abc123';

function createRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

const validHeaders = {
  'x-internal-secret': INTERNAL_SECRET,
  'x-org-id': 'org-123',
  'x-user-id': 'user-456',
  'x-project-id': 'proj-789',
};

describe('/api/v1/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('INTERNAL_API_SECRET', INTERNAL_SECRET);

    mockFindUnique.mockResolvedValue({
      organizationId: 'org-123',
      settings: { instructions: 'Be helpful' },
    });

    mockGetAllSettings.mockResolvedValue({
      apiKey: 'some-key',
    });

    mockStream.mockResolvedValue({
      textStream: (async function* () {
        yield 'Hello ';
        yield 'world';
      })(),
    });
  });

  describe('POST - internal secret authentication', () => {
    it('should return 401 when internal secret is missing', async () => {
      const req = createRequest(
        { prompt: 'hello' },
        {
          'x-org-id': 'org-123',
          'x-user-id': 'user-456',
          'x-project-id': 'proj-789',
        },
      );
      const response = await POST(req);
      expect(response.status).toBe(401);
    });

    it('should return 401 when internal secret is wrong', async () => {
      const req = createRequest(
        { prompt: 'hello' },
        { ...validHeaders, 'x-internal-secret': 'wrong-secret' },
      );
      const response = await POST(req);
      expect(response.status).toBe(401);
    });

    it('should return 401 when context headers are missing', async () => {
      const req = createRequest(
        { prompt: 'hello' },
        { 'x-internal-secret': INTERNAL_SECRET },
      );
      const response = await POST(req);
      expect(response.status).toBe(401);
    });

    it('should return 401 when only some context headers are present', async () => {
      const req = createRequest(
        { prompt: 'hello' },
        {
          'x-internal-secret': INTERNAL_SECRET,
          'x-org-id': 'org-123',
        },
      );
      const response = await POST(req);
      expect(response.status).toBe(401);
    });
  });

  describe('POST - validation', () => {
    it('should return 400 for invalid JSON', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...validHeaders,
        },
        body: 'not json',
      });
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid JSON');
    });

    it('should return 400 for empty prompt', async () => {
      const req = createRequest({ prompt: '' }, validHeaders);
      const response = await POST(req);
      expect(response.status).toBe(400);
    });
  });

  describe('POST - non-streaming', () => {
    it('should return JSON response with collected text', async () => {
      const req = createRequest({ prompt: 'hello' }, validHeaders);
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.text).toBe('Hello world');
    });

    it('should return 404 when project is not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const req = createRequest({ prompt: 'hello' }, validHeaders);
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data.error).toBe('Assistant not found');
    });
  });

  describe('POST - streaming', () => {
    it('should return SSE stream with correct headers', async () => {
      const req = createRequest(
        { prompt: 'hello', stream: true },
        validHeaders,
      );
      const response = await POST(req);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe(
        'text/event-stream; charset=utf-8',
      );
      expect(response.headers.get('Cache-Control')).toBe(
        'no-cache, no-transform',
      );

      const text = await response.text();
      expect(text).toContain('data: {"text":"Hello "}');
      expect(text).toContain('data: {"text":"world"}');
      expect(text).toContain('data: [DONE]');
    });
  });

  describe('POST - context handling', () => {
    it('should append page context to the question when provided', async () => {
      const req = createRequest(
        { prompt: 'hello', context: 'page info' },
        validHeaders,
      );
      await POST(req);

      expect(mockStream).toHaveBeenCalledWith({
        question: 'hello\n\nKontekst strony:\npage info',
        chat_history: '',
      });
    });

    it('should use prompt only when no context provided', async () => {
      const req = createRequest({ prompt: 'hello' }, validHeaders);
      await POST(req);

      expect(mockStream).toHaveBeenCalledWith({
        question: 'hello',
        chat_history: '',
      });
    });
  });
});
