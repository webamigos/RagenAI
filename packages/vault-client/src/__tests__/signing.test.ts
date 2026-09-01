import { describe, it, expect } from 'vitest';
import { createHash, createHmac } from 'node:crypto';

import { signVaultRequest, vaultAuthorizationHeader } from '../signing';

const SECRET = 'shared-service-secret';

describe('signVaultRequest', () => {
  it('signs the canonical message the vault server verifies', () => {
    // Spelled out rather than compared against another call of the function —
    // the point of this test is that the scheme itself does not drift, and a
    // self-referential assertion would move along with any change.
    const timestamp = 1_700_000_000;
    const body = JSON.stringify({ accessToken: 'a' });
    const expected = createHmac('sha256', SECRET)
      .update(
        `${timestamp}\nPOST\n/v1/tokens/cust/google\n${createHash('sha256')
          .update(body)
          .digest('hex')}`,
      )
      .digest('hex');

    expect(
      signVaultRequest({
        secret: SECRET,
        timestamp,
        method: 'POST',
        path: '/v1/tokens/cust/google',
        body,
      }),
    ).toBe(expected);
  });

  it('hashes an empty body rather than skipping the field', () => {
    const timestamp = 1_700_000_000;
    const emptySha = createHash('sha256').update('').digest('hex');
    const expected = createHmac('sha256', SECRET)
      .update(`${timestamp}\nGET\n/v1/tokens/cust\n${emptySha}`)
      .digest('hex');

    expect(
      signVaultRequest({
        secret: SECRET,
        timestamp,
        method: 'GET',
        path: '/v1/tokens/cust',
        body: '',
      }),
    ).toBe(expected);
  });

  it('accepts the timestamp as a string, as apps/api passes it', () => {
    expect(
      signVaultRequest({
        secret: SECRET,
        timestamp: '1700000000',
        method: 'GET',
        path: '/v1/tokens/cust',
        body: '',
      }),
    ).toBe(
      signVaultRequest({
        secret: SECRET,
        timestamp: 1_700_000_000,
        method: 'GET',
        path: '/v1/tokens/cust',
        body: '',
      }),
    );
  });

  it('changes when any part of the request changes', () => {
    const base = {
      secret: SECRET,
      timestamp: 1_700_000_000,
      method: 'GET',
      path: '/v1/tokens/cust',
      body: '',
    };
    const signature = signVaultRequest(base);

    expect(signVaultRequest({ ...base, method: 'DELETE' })).not.toBe(signature);
    expect(signVaultRequest({ ...base, path: '/v1/tokens/other' })).not.toBe(
      signature,
    );
    expect(signVaultRequest({ ...base, body: '{}' })).not.toBe(signature);
    expect(signVaultRequest({ ...base, timestamp: 1_700_000_001 })).not.toBe(
      signature,
    );
    expect(signVaultRequest({ ...base, secret: 'other' })).not.toBe(signature);
  });
});

describe('vaultAuthorizationHeader', () => {
  it('formats the header the vault parses', () => {
    expect(vaultAuthorizationHeader(1_700_000_000, 'abc123')).toBe(
      'HMAC-SHA256 ts=1700000000,sig=abc123',
    );
  });
});
