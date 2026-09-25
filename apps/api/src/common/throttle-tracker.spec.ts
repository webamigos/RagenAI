import { describe, expect, it, vi } from 'vitest';
import { throttleTracker } from './throttle-tracker.js';
import { type SessionAuthContext } from './types/session-auth-context.js';

const ctx = { userId: 'u-1', orgId: 'o-1' } as SessionAuthContext;

describe('throttleTracker', () => {
  it('counts apps/web’s server-to-server calls per person, not per the server’s IP', () => {
    const verify = vi.fn(() => ctx);
    expect(
      throttleTracker(
        { ip: '10.0.0.5', headers: { authorization: 'Bearer signed.token' } },
        verify,
      ),
    ).toBe('user:u-1');
    expect(verify).toHaveBeenCalledWith('signed.token');
  });

  it('gives two people behind the same server two buckets', () => {
    const verify = (token: string) =>
      ({ userId: token, orgId: 'o' }) as SessionAuthContext;
    const a = throttleTracker(
      { ip: '10.0.0.5', headers: { authorization: 'Bearer a' } },
      verify,
    );
    const b = throttleTracker(
      { ip: '10.0.0.5', headers: { authorization: 'Bearer b' } },
      verify,
    );
    expect(a).not.toBe(b);
  });

  it('falls back to the IP for a token that does not verify — a forged header buys nothing', () => {
    expect(
      throttleTracker(
        { ip: '203.0.113.9', headers: { authorization: 'Bearer forged' } },
        () => null,
      ),
    ).toBe('203.0.113.9');
  });

  it('keeps the IP for a request with no session token (a public API key, or none)', () => {
    const verify = vi.fn(() => ctx);
    expect(
      throttleTracker(
        { ip: '203.0.113.9', headers: { authorization: 'sk-abc.def' } },
        verify,
      ),
    ).toBe('203.0.113.9');
    expect(
      throttleTracker(
        { ips: ['198.51.100.1'], ip: '10.0.0.1', headers: {} },
        verify,
      ),
    ).toBe('198.51.100.1');
    expect(verify).not.toHaveBeenCalled();
  });
});
