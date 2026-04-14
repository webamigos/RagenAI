import { timingSafeEqual } from 'node:crypto';
import type { NextRequest } from 'next/server';
import { recordSecurityEvent } from '@/features/security/services/commands/record-security-event-command';

/**
 * Context forwarded from ragen-api (or another internal caller) via
 * headers. Populated after the shared-secret handshake succeeds.
 */
export type InternalContext = {
  orgId: string;
  userId: string;
  projectId: string;
};

/**
 * Thrown when the `x-internal-secret` header is missing or doesn't
 * match `INTERNAL_API_SECRET`. Callers should translate this to a 401
 * response (and record a security event via `recordInternalAuthFailure`
 * for forensic traceability).
 */
export class InternalAuthError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'InternalAuthError';
  }
}

/**
 * Verify the `x-internal-secret` header against `INTERNAL_API_SECRET`
 * using a timing-safe comparison. Throws `InternalAuthError` on any
 * mismatch, empty value, or unconfigured env var.
 */
export function verifyInternalSecret(request: NextRequest): void {
  const secret = request.headers.get('x-internal-secret');
  const expected = process.env.INTERNAL_API_SECRET;

  if (!expected) {
    throw new Error('INTERNAL_API_SECRET not configured');
  }

  if (!secret) {
    throw new InternalAuthError();
  }

  const secretBuf = Buffer.from(secret);
  const expectedBuf = Buffer.from(expected);

  if (
    secretBuf.length !== expectedBuf.length ||
    !timingSafeEqual(secretBuf, expectedBuf)
  ) {
    throw new InternalAuthError();
  }
}

/**
 * Extract the `x-org-id`, `x-user-id`, `x-project-id` headers set by
 * the caller (ragen-api sets these after API-key validation). Throws
 * `InternalAuthError` if any are missing — these headers are the app's
 * only source of caller identity on internal routes.
 */
export function extractInternalContext(request: NextRequest): InternalContext {
  const orgId = request.headers.get('x-org-id');
  const userId = request.headers.get('x-user-id');
  const projectId = request.headers.get('x-project-id');

  if (!orgId || !userId || !projectId) {
    throw new InternalAuthError();
  }

  return { orgId, userId, projectId };
}

/**
 * Record a security event for a failed internal-secret handshake.
 * Fire-and-forget — the caller responds with 401 immediately and this
 * runs async. Escalation rules upgrade severity to `critical` on a
 * burst of 5 from the same IP within 10 minutes.
 */
export function recordInternalAuthFailure(
  request: NextRequest,
  path: string,
  reason: string,
): void {
  recordSecurityEvent({
    eventType: 'API_INTERNAL_SECRET_MISMATCH',
    severity: 'warn',
    source: 'api',
    ipAddress:
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: request.headers.get('user-agent') ?? null,
    metadata: { path, reason },
  });
}
