import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHash, createHmac } from 'node:crypto';

import { RagenAuthClient } from '../client';

const SECRET = 'shared-service-secret';

function makeClient(logger?: { info: ReturnType<typeof vi.fn> }) {
  return new RagenAuthClient({
    baseUrl: 'https://vault.example.com/',
    secret: SECRET,
    serviceName: 'ragen-test',
    logger,
  });
}

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('RagenAuthClient', () => {
  it('signs the request it actually sends', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await makeClient().deleteToken('cust-1', 'google');

    const [url, init] = fetchMock.mock.calls[0];
    // The trailing slash on baseUrl must not survive into the path, or the
    // signed path and the requested path disagree and the vault returns 401.
    expect(url).toBe('https://vault.example.com/v1/tokens/cust-1/google');
    expect(init.method).toBe('DELETE');

    const auth = init.headers.Authorization as string;
    const [, ts, sig] = auth.match(/^HMAC-SHA256 ts=(\d+),sig=([0-9a-f]+)$/)!;
    const expected = createHmac('sha256', SECRET)
      .update(
        `${ts}\nDELETE\n/v1/tokens/cust-1/google\n${createHash('sha256')
          .update('')
          .digest('hex')}`,
      )
      .digest('hex');
    expect(sig).toBe(expected);
  });

  it('identifies itself with the configured service name', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tokens: [] }));

    await makeClient().listTokens('cust-1');

    expect(fetchMock.mock.calls[0][1].headers['X-Service-Name']).toBe(
      'ragen-test',
    );
  });

  it('percent-encodes ids so a slash cannot forge a path', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await makeClient().deleteToken('cust/../other', 'google');

    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://vault.example.com/v1/tokens/cust%2F..%2Fother/google',
    );
  });

  it('sends a JSON content type only when there is a body', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tokens: [] }));
    await makeClient().listTokens('cust-1');
    expect(fetchMock.mock.calls[0][1].headers['Content-Type']).toBeUndefined();

    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await makeClient().storeToken('cust-1', 'google', {
      accessToken: 'tok',
    });
    expect(fetchMock.mock.calls[1][1].headers['Content-Type']).toBe(
      'application/json',
    );
  });

  it('returns undefined for a 204 instead of trying to parse a body', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(
      makeClient().deleteToken('cust-1', 'google'),
    ).resolves.toBeUndefined();
  });

  it('raises the status and the body when the vault refuses', async () => {
    fetchMock.mockResolvedValue(new Response('bad signature', { status: 401 }));

    await expect(makeClient().listTokens('cust-1')).rejects.toThrow(
      /GET \/v1\/tokens\/cust-1 returned 401: bad signature/,
    );
  });

  it('reports a timeout as a timeout, not as an abort', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }),
    );
    vi.useFakeTimers();

    const pending = makeClient().listTokens('cust-1');
    const assertion = expect(pending).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
  });

  it('logs through the injected logger and tolerates its absence', async () => {
    const logger = { info: vi.fn() };
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await makeClient(logger).storeToken('cust-1', 'google', {
      accessToken: 'tok',
    });
    expect(logger.info).toHaveBeenCalledWith(
      { provider: 'google' },
      expect.stringContaining('Stored token'),
    );

    // No logger configured is the default for callers that do not want one.
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(
      makeClient().storeToken('cust-1', 'google', { accessToken: 'tok' }),
    ).resolves.toBeUndefined();
  });
});
