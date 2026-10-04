import { describe, expect, it, vi } from 'vitest';

import { ApiError, createApiClient, resolveConnection } from '../api';
import { parseFlags } from '../flags';

function respond(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json', ...headers },
      }),
  );
}

const connection = { url: 'https://api.example.com', key: 'sk-k.s' };

describe('resolveConnection', () => {
  it('prefers flags to the environment and trims trailing slashes', () => {
    const flags = parseFlags(['--url', 'https://flag.example.com//'], []);
    expect(
      resolveConnection(flags, {
        RAGEN_API_URL: 'https://env.example.com',
        RAGEN_API_KEY: 'sk-env',
      }),
    ).toEqual({ url: 'https://flag.example.com', key: 'sk-env' });
  });

  it('is undefined when either half is missing', () => {
    expect(
      resolveConnection(parseFlags([], []), { RAGEN_API_URL: 'https://x' }),
    ).toBeUndefined();
  });
});

describe('createApiClient', () => {
  it('sends the key, the query string and a JSON body under /v1', async () => {
    const fetchMock = respond(200, { ok: true });
    const api = createApiClient(
      fetchMock as unknown as typeof fetch,
      connection,
    );
    await api('search', {
      method: 'POST',
      query: { limit: 5, after: undefined },
      body: { query: 'q' },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://api.example.com/v1/search?limit=5');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-k.s');
    expect(headers['Content-Type']).toBe('application/json');
    expect(init.body).toBe('{"query":"q"}');
  });

  it('leaves Content-Type to fetch for multipart, so the boundary survives', async () => {
    const fetchMock = respond(200, {});
    const api = createApiClient(
      fetchMock as unknown as typeof fetch,
      connection,
    );
    const form = new FormData();
    form.append('purpose', 'knowledge_base');
    await api('files', { method: 'POST', body: form });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(
      (init.headers as Record<string, string>)['Content-Type'],
    ).toBeUndefined();
    expect(init.body).toBe(form);
  });

  it('keeps the server message from an OpenAI-shaped error', async () => {
    const api = createApiClient(
      respond(413, {
        error: { message: 'File too large', type: 'invalid_request_error' },
      }) as unknown as typeof fetch,
      connection,
    );
    await expect(api('files')).rejects.toThrow(
      'The API answered 413. (File too large)',
    );
  });

  it('keeps a limit message sent as a plain string in `error`', async () => {
    const api = createApiClient(
      respond(429, {
        error: 'Monthly usage limit exceeded',
        code: 'LIMIT',
      }) as unknown as typeof fetch,
      connection,
    );
    await expect(api('chat')).rejects.toThrow(
      'Too many requests: the rate or usage limit was reached. (Monthly usage limit exceeded)',
    );
  });

  it('joins class-validator messages', async () => {
    const api = createApiClient(
      respond(400, {
        statusCode: 400,
        message: [
          'query must be longer',
          'max_results must not be greater than 20',
        ],
      }) as unknown as typeof fetch,
      connection,
    );
    await expect(api('search')).rejects.toThrow(
      'query must be longer; max_results must not be greater than 20',
    );
  });

  it('uses the caller’s sentence for a 404', async () => {
    const api = createApiClient(
      respond(404, {}) as unknown as typeof fetch,
      connection,
    );
    await expect(
      api('brain/next', { notFound: 'Brain is off.' }),
    ).rejects.toThrow('Brain is off.');
  });

  it('names a refused key and carries Retry-After on a 429', async () => {
    const refused = createApiClient(
      respond(401, {}) as unknown as typeof fetch,
      connection,
    );
    await expect(refused('files')).rejects.toThrow('The API key was refused.');

    const limited = createApiClient(
      respond(429, {}, { 'Retry-After': '7' }) as unknown as typeof fetch,
      connection,
    );
    const error = await limited('files').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(429);
    expect((error as ApiError).retryAfter).toBe(7);
  });

  it('reads the throttler-named Retry-After header @nestjs/throttler sends', async () => {
    const api = createApiClient(
      respond(
        429,
        {},
        {
          'Retry-After-cheap': '5',
          'Retry-After-expensive': '60',
        },
      ) as unknown as typeof fetch,
      connection,
    );
    const error = (await api('files').catch((e: unknown) => e)) as ApiError;
    expect(error.retryAfter).toBe(60);
  });

  it('survives an error with no JSON body', async () => {
    const api = createApiClient(
      vi.fn(
        async () => new Response('Bad Gateway', { status: 502 }),
      ) as unknown as typeof fetch,
      connection,
    );
    await expect(api('files')).rejects.toThrow('The API answered 502.');
  });
});
