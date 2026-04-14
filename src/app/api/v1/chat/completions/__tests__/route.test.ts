import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockFindUnique = vi.fn();
const mockGetAllSettings = vi.fn();
const mockStream = vi.fn();
const mockInitializeRagChain = vi.fn();

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
  initializeRagChain: (...args: unknown[]) => mockInitializeRagChain(...args),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn() },
}));

vi.mock(
  '@/features/security/services/commands/record-security-event-command',
  () => ({
    recordSecurityEvent: vi.fn(),
  }),
);

import { POST } from '../route';

const INTERNAL_SECRET = 'test-internal-secret-abc123';

function createRequest(
  body: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/chat/completions', {
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

describe('/api/v1/chat/completions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('INTERNAL_API_SECRET', INTERNAL_SECRET);

    mockFindUnique.mockResolvedValue({
      organizationId: 'org-123',
      settings: { instructions: 'Be helpful' },
    });

    mockGetAllSettings.mockResolvedValue({
      apiKey: 'some-key',
      model: 'org-default-model',
      temperature: 0.5,
    });

    mockStream.mockResolvedValue({
      textStream: (async function* () {
        yield 'Hello ';
        yield 'world';
      })(),
      usage: Promise.resolve({
        inputTokens: 10,
        outputTokens: 2,
        totalTokens: 12,
      }),
    });

    mockInitializeRagChain.mockResolvedValue({
      stream: (...args: unknown[]) => mockStream(...args),
    });
  });

  describe('auth', () => {
    it('returns 401 when internal secret is missing', async () => {
      const req = createRequest(
        { messages: [{ role: 'user', content: 'hi' }] },
        {
          'x-org-id': 'org-123',
          'x-user-id': 'user-456',
          'x-project-id': 'proj-789',
        },
      );
      const response = await POST(req);
      expect(response.status).toBe(401);
    });

    it('returns 401 when context headers missing', async () => {
      const req = createRequest(
        { messages: [{ role: 'user', content: 'hi' }] },
        { 'x-internal-secret': INTERNAL_SECRET },
      );
      const response = await POST(req);
      expect(response.status).toBe(401);
    });
  });

  describe('validation', () => {
    it('rejects invalid JSON', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/chat/completions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...validHeaders },
          body: 'not json',
        },
      );
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it('rejects empty messages array', async () => {
      const req = createRequest({ messages: [] }, validHeaders);
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it('rejects invalid role', async () => {
      const req = createRequest(
        { messages: [{ role: 'bot', content: 'hi' }] },
        validHeaders,
      );
      const response = await POST(req);
      expect(response.status).toBe(400);
    });

    it('rejects out-of-range temperature', async () => {
      const req = createRequest(
        {
          messages: [{ role: 'user', content: 'hi' }],
          temperature: 5,
        },
        validHeaders,
      );
      const response = await POST(req);
      expect(response.status).toBe(400);
    });
  });

  describe('message folding', () => {
    it('maps single user message to question with empty history', async () => {
      const req = createRequest(
        { messages: [{ role: 'user', content: 'hello' }] },
        validHeaders,
      );
      await POST(req);

      expect(mockStream).toHaveBeenCalledWith({
        question: 'hello',
        chat_history: '',
      });
    });

    it('maps prior turns into chat_history', async () => {
      const req = createRequest(
        {
          messages: [
            { role: 'system', content: 'be terse' },
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
            { role: 'user', content: 'how are you?' },
          ],
        },
        validHeaders,
      );
      await POST(req);

      expect(mockStream).toHaveBeenCalledWith({
        question: 'how are you?',
        chat_history: 'System: be terse\nUser: hi\nAssistant: hello',
      });
    });
  });

  describe('overrides', () => {
    it('overrides model when provided', async () => {
      const req = createRequest(
        {
          messages: [{ role: 'user', content: 'hi' }],
          model: 'gpt-5.4',
        },
        validHeaders,
      );
      await POST(req);

      expect(mockInitializeRagChain).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({ model: 'gpt-5.4' }),
        }),
      );
    });

    it('falls back to org-default model when not provided', async () => {
      const req = createRequest(
        { messages: [{ role: 'user', content: 'hi' }] },
        validHeaders,
      );
      await POST(req);

      expect(mockInitializeRagChain).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({ model: 'org-default-model' }),
        }),
      );
    });

    it('passes max_tokens through to initializeRagChain', async () => {
      const req = createRequest(
        {
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 250,
        },
        validHeaders,
      );
      await POST(req);

      expect(mockInitializeRagChain).toHaveBeenCalledWith(
        expect.objectContaining({ maxTokens: 250 }),
      );
    });

    it('overrides temperature when provided', async () => {
      const req = createRequest(
        {
          messages: [{ role: 'user', content: 'hi' }],
          temperature: 0.1,
        },
        validHeaders,
      );
      await POST(req);

      expect(mockInitializeRagChain).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({ temperature: 0.1 }),
        }),
      );
    });
  });

  describe('non-streaming response', () => {
    it('returns { text, model, usage } JSON', async () => {
      const req = createRequest(
        { messages: [{ role: 'user', content: 'hi' }] },
        validHeaders,
      );
      const response = await POST(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        text: 'Hello world',
        model: 'org-default-model',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 2,
          total_tokens: 12,
        },
      });
    });

    it('returns 404 when project not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const req = createRequest(
        { messages: [{ role: 'user', content: 'hi' }] },
        validHeaders,
      );
      const response = await POST(req);
      expect(response.status).toBe(404);
    });
  });

  describe('streaming response', () => {
    it('returns SSE with text chunks, final usage/model, and [DONE]', async () => {
      const req = createRequest(
        {
          messages: [{ role: 'user', content: 'hi' }],
          stream: true,
        },
        validHeaders,
      );
      const response = await POST(req);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe(
        'text/event-stream; charset=utf-8',
      );

      const text = await response.text();
      expect(text).toContain('data: {"text":"Hello "}');
      expect(text).toContain('data: {"text":"world"}');
      expect(text).toContain(
        '"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}',
      );
      expect(text).toContain('"model":"org-default-model"');
      expect(text).toContain('data: [DONE]');
    });
  });
});
