import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/libs/service-auth/issue-session-token', () => ({
  issueSessionToken: vi.fn(() => 'signed-token'),
}));

import { ragenApiRequest, RagenApiError } from '../client';
import { issueSessionToken } from '@/libs/service-auth/issue-session-token';

describe('ragenApiRequest', () => {
  beforeEach(() => {
    vi.stubEnv('RAGEN_API_INTERNAL_URL', 'http://ragen-api:3001');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('throws when RAGEN_API_INTERNAL_URL is not configured', async () => {
    vi.stubEnv('RAGEN_API_INTERNAL_URL', '');

    await expect(
      ragenApiRequest({
        method: 'GET',
        path: '/v1/internal/notifications',
        userId: 'user-1',
        orgId: 'org-1',
      }),
    ).rejects.toThrow('Missing RAGEN_API_INTERNAL_URL');
  });

  it('mints a session token for the given userId/orgId/projectId and sends it as a bearer token', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{"ok":true}', { status: 200 }));

    await ragenApiRequest({
      method: 'GET',
      path: '/v1/internal/notifications',
      userId: 'user-1',
      orgId: 'org-1',
      projectId: 'proj-1',
    });

    expect(issueSessionToken).toHaveBeenCalledWith({
      userId: 'user-1',
      orgId: 'org-1',
      projectId: 'proj-1',
    });
    const [, init] = fetchSpy.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      'Bearer signed-token',
    );
  });

  it('appends query params, skipping undefined values', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await ragenApiRequest({
      method: 'GET',
      path: '/v1/internal/notifications',
      userId: 'user-1',
      orgId: 'org-1',
      query: { limit: 20, isRead: undefined, cursor: 'abc' },
    });

    const [url] = fetchSpy.mock.calls[0];
    const parsed = new URL(url as string);
    expect(parsed.searchParams.get('limit')).toBe('20');
    expect(parsed.searchParams.get('cursor')).toBe('abc');
    expect(parsed.searchParams.has('isRead')).toBe(false);
  });

  it('JSON-encodes the body and sets Content-Type when a body is provided', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }));

    await ragenApiRequest({
      method: 'POST',
      path: '/v1/internal/notifications',
      userId: 'user-1',
      orgId: 'org-1',
      body: { title: 'hi' },
    });

    const [, init] = fetchSpy.mock.calls[0];
    expect(init?.body).toBe(JSON.stringify({ title: 'hi' }));
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('returns the parsed JSON body on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ items: [1, 2, 3] }), { status: 200 }),
    );

    const result = await ragenApiRequest<{ items: number[] }>({
      method: 'GET',
      path: '/v1/internal/notifications',
      userId: 'user-1',
      orgId: 'org-1',
    });

    expect(result).toEqual({ items: [1, 2, 3] });
  });

  it('returns undefined for an empty (e.g. 204) response body', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', { status: 200 }),
    );

    const result = await ragenApiRequest({
      method: 'POST',
      path: '/v1/internal/notifications/read-all',
      userId: 'user-1',
      orgId: 'org-1',
    });

    expect(result).toBeUndefined();
  });

  it('throws RagenApiError with the upstream status and body on a non-2xx response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"message":"Not found"}', { status: 404 }),
    );

    const promise = ragenApiRequest({
      method: 'GET',
      path: '/v1/internal/notifications/missing',
      userId: 'user-1',
      orgId: 'org-1',
    });

    await expect(promise).rejects.toBeInstanceOf(RagenApiError);
    await expect(promise).rejects.toMatchObject({
      status: 404,
      body: '{"message":"Not found"}',
    });
  });

  it('re-throws AbortError without wrapping it', async () => {
    const abortError = new DOMException('Aborted', 'AbortError');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(abortError);

    await expect(
      ragenApiRequest({
        method: 'GET',
        path: '/v1/internal/notifications',
        userId: 'user-1',
        orgId: 'org-1',
      }),
    ).rejects.toBe(abortError);
  });

  it('wraps other network failures in a generic "Upstream service unavailable" error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      ragenApiRequest({
        method: 'GET',
        path: '/v1/internal/notifications',
        userId: 'user-1',
        orgId: 'org-1',
      }),
    ).rejects.toThrow('Upstream service unavailable');
  });
});
