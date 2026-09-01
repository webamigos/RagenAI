import crypto from 'node:crypto';

const DEFAULT_TTL_MS = 30_000;

export interface SessionAuthTokenParams {
  userId: string;
  orgId: string;
  projectId?: string;
  ttlMs?: number;
}

/**
 * Signs a short-lived token that lets apps/api trust a request as coming
 * from a user ragen-app has already authenticated via Better Auth — used
 * for server-to-server calls only (never sent to the browser). apps/api's
 * SessionAuthService verifies it with the same shared secret.
 *
 * See docs/adrs/21-monorepo-and-api-decoupling.md (Phase A).
 */
export function issueSessionToken({
  userId,
  orgId,
  projectId,
  ttlMs = DEFAULT_TTL_MS,
}: SessionAuthTokenParams): string {
  const secret = process.env.SESSION_AUTH_SECRET;

  if (!secret) {
    throw new Error('Missing SESSION_AUTH_SECRET environment variable');
  }

  const payload = {
    userId,
    orgId,
    ...(projectId ? { projectId } : {}),
    exp: Date.now() + ttlMs,
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', secret)
    .update(payloadB64)
    .digest('hex');

  return `${payloadB64}.${signature}`;
}
