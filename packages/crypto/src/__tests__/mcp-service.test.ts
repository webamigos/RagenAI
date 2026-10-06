import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  issueMcpServiceAssertion,
  verifyMcpServiceAssertion,
} from '../mcp-service';
const secret = 'mcp-service-secret-32-characters-long';
const now = 1_800_000_000_000;
const identity = {
  userId: 'user-a',
  orgId: 'org-a',
  clientId: 'client-a',
  jti: 'token-a',
  projectId: 'project-a',
};
function raw(payload: unknown, prefix = 'mcp') {
  const body = `${prefix}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}
describe('MCP service assertions', () => {
  it('round trips a typed identity for exactly thirty seconds', () => {
    const token = issueMcpServiceAssertion(identity, secret, now);
    expect(verifyMcpServiceAssertion(token, secret, now)).toEqual({
      ...identity,
      typ: 'mcp',
      iat: now / 1000,
      exp: now / 1000 + 30,
    });
    expect(
      verifyMcpServiceAssertion(token, secret, now + 29_999),
    ).not.toBeNull();
    expect(verifyMcpServiceAssertion(token, secret, now + 30_000)).toBeNull();
  });
  it('refuses a changed payload, signature, secret or namespace', () => {
    const token = issueMcpServiceAssertion(identity, secret, now);
    for (const invalid of [
      token.replace('mcp.', 'session.'),
      token + 'x',
      token.replace(/.$/, '!'),
      token.split('.').slice(1).join('.'),
    ]) {
      expect(verifyMcpServiceAssertion(invalid, secret, now)).toBeNull();
    }
    expect(
      verifyMcpServiceAssertion(
        token,
        'another-dedicated-secret-32-characters',
        now,
      ),
    ).toBeNull();
    expect(verifyMcpServiceAssertion(token, undefined, now)).toBeNull();
  });
  it.each([
    { typ: 'session' },
    { userId: '' },
    { orgId: 1 },
    { clientId: null },
    { jti: '' },
    { projectId: false },
    { iat: now / 1000 + 10 },
    { exp: now / 1000 + 31 },
    { exp: now / 1000 },
    { iat: 'today' },
  ])('refuses correctly signed but invalid claims: %j', (changes) => {
    expect(
      verifyMcpServiceAssertion(
        raw({
          ...identity,
          typ: 'mcp',
          iat: now / 1000,
          exp: now / 1000 + 30,
          ...changes,
        }),
        secret,
        now,
      ),
    ).toBeNull();
  });
  it('signs the namespace too and fails closed on malformed input', () => {
    expect(
      verifyMcpServiceAssertion(
        raw(identity, 'session').replace('session.', 'mcp.'),
        secret,
        now,
      ),
    ).toBeNull();
    for (const token of ['', 'mcp.a.b', raw(null), raw([])]) {
      expect(verifyMcpServiceAssertion(token, secret, now)).toBeNull();
    }
    expect(() => issueMcpServiceAssertion(identity, 'short', now)).toThrow();
  });
});
