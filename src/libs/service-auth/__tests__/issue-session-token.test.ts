import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { issueSessionToken } from '../issue-session-token';

const SECRET = 'test-session-auth-secret';

describe('issueSessionToken', () => {
  beforeEach(() => {
    vi.stubEnv('SESSION_AUTH_SECRET', SECRET);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('throws when SESSION_AUTH_SECRET is not configured', () => {
    vi.stubEnv('SESSION_AUTH_SECRET', '');
    expect(() =>
      issueSessionToken({ userId: 'user_1', orgId: 'org_1' }),
    ).toThrow('Missing SESSION_AUTH_SECRET environment variable');
  });

  it('produces a token with a correctly HMAC-signed payload', () => {
    const token = issueSessionToken({ userId: 'user_1', orgId: 'org_1' });
    const [payloadB64, signature] = token.split('.');

    const expectedSignature = crypto
      .createHmac('sha256', SECRET)
      .update(payloadB64)
      .digest('hex');
    expect(signature).toBe(expectedSignature);

    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    );
    expect(payload.userId).toBe('user_1');
    expect(payload.orgId).toBe('org_1');
    expect(payload.projectId).toBeUndefined();
    expect(payload.exp).toBeGreaterThan(Date.now());
  });

  it('includes projectId in the payload when provided', () => {
    const token = issueSessionToken({
      userId: 'user_1',
      orgId: 'org_1',
      projectId: 'proj_1',
    });
    const [payloadB64] = token.split('.');
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    );
    expect(payload.projectId).toBe('proj_1');
  });

  it('respects a custom ttlMs', () => {
    const before = Date.now();
    const token = issueSessionToken({
      userId: 'user_1',
      orgId: 'org_1',
      ttlMs: 5_000,
    });
    const [payloadB64] = token.split('.');
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8'),
    );
    expect(payload.exp).toBeGreaterThanOrEqual(before + 5_000);
    expect(payload.exp).toBeLessThan(before + 6_000);
  });
});
