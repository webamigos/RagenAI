import type { IncomingMessage } from 'node:http';

import { authenticate } from '../auth.js';

function makeRequest(authorization?: string): IncomingMessage {
  return { headers: { authorization } } as unknown as IncomingMessage;
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
});
