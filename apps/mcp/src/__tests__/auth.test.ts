import type { IncomingMessage } from 'node:http';

import { logger } from '../logger.js';
import { authenticate } from '../auth.js';

jest.mock('../logger.js', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
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
    const logged = JSON.stringify((logger.warn as jest.Mock).mock.calls);
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
