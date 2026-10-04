import type { IncomingMessage } from 'node:http';

import type { Mock } from 'vitest';

import { logger } from '../logger.js';
import { authenticate } from '../auth.js';
import { resetEnvCache } from '../config/env.js';

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

function makeRequest(
  authorization?: string,
  userAgent?: string,
): IncomingMessage {
  return {
    headers: { authorization, 'user-agent': userAgent },
  } as unknown as IncomingMessage;
}

describe('authenticate', () => {
  it('returns the forwarded Authorization header as apiKey for a Bearer-prefixed value', async () => {
    const session = await authenticate(makeRequest('Bearer sk-abc.def'));

    expect(session).toEqual({ apiKey: 'Bearer sk-abc.def' });
  });

  it('rejects with a 401 Response when the header is missing', async () => {
    await expect(authenticate(makeRequest(undefined))).rejects.toMatchObject({
      status: 401,
    });
  });

  it('rejects with a 401 Response when the header is not Bearer-prefixed', async () => {
    await expect(
      authenticate(makeRequest('Basic dXNlcjpwYXNz')),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('takes the first value when the header arrives as an array', async () => {
    const request = {
      headers: { authorization: ['Bearer sk-first', 'Bearer sk-second'] },
    } as unknown as IncomingMessage;

    const session = await authenticate(request);

    expect(session).toEqual({ apiKey: 'Bearer sk-first' });
  });

  it('logs a rejection without ever putting the supplied credential in the log', async () => {
    await expect(
      authenticate(makeRequest('Basic dXNlcjpwYXNz', 'Claude Desktop/1.2')),
    ).rejects.toMatchObject({ status: 401 });

    expect(logger.warn).toHaveBeenCalledWith(
      { hasHeader: true, userAgent: 'Claude Desktop/1.2' },
      'Rejected MCP connection: missing or malformed Authorization header',
    );
    // The point of the assertion: a malformed value is still a credential
    // someone typed, so it must not reach the logs.
    const logged = JSON.stringify((logger.warn as Mock).mock.calls);
    expect(logged).not.toContain('dXNlcjpwYXNz');
  });

  it('distinguishes "no header at all" from "wrong scheme"', async () => {
    await expect(authenticate(makeRequest(undefined))).rejects.toMatchObject({
      status: 401,
    });

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ hasHeader: false }),
      expect.any(String),
    );
  });
});

describe('authenticate over stdio, where there is no request', () => {
  const ORIGINAL_ENV = process.env;

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    resetEnvCache();
  });

  function withKey(key: string | undefined) {
    process.env = { TARGET_ENV: 'local', RAGEN_API_KEY: key };
    resetEnvCache();
  }

  it('builds the Bearer header apps/api expects from RAGEN_API_KEY', async () => {
    withKey('sk-abc.def');

    await expect(authenticate(undefined)).resolves.toEqual({
      apiKey: 'Bearer sk-abc.def',
    });
  });

  // FastMCP catches this, logs it and starts the session anyway — which is
  // what lets tools/list answer with no key. The message is what an operator
  // reads on stderr, so it names the variable.
  it('rejects without a key, naming the variable to set', async () => {
    withKey(undefined);

    await expect(authenticate(undefined)).rejects.toThrow(/RAGEN_API_KEY/);
  });
});
