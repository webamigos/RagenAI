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
  projectId?: string;
  /**
   * Optional team id propagated from ragen-api when the API key caller
   * targets a specific team. Unvalidated here — the endpoint is responsible
   * for checking the team belongs to `orgId` and `userId` is a member.
   */
  teamId?: string;
};

/**
 * Strict variant of InternalContext where projectId is guaranteed present.
 * Used by endpoints that require a resolved project (files, etc.).
 */
export type StrictInternalContext = {
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
 * Extract the `x-org-id`, `x-user-id`, and optional `x-project-id`
 * headers set by ragen-api after API-key validation.
 *
 * Required: `x-org-id`, `x-user-id` — throws `InternalAuthError` if
 * either is missing. Optional: `x-project-id` — may be absent for
 * org-scoped API keys where the caller specifies `assistant_id` in
 * the request body instead.
 */
export function extractInternalContext(request: NextRequest): InternalContext {
  const orgId = request.headers.get('x-org-id');
  const userId = request.headers.get('x-user-id');
  const projectId = request.headers.get('x-project-id') ?? undefined;
  const teamId = request.headers.get('x-ragen-team-id') ?? undefined;

  if (!orgId || !userId) {
    throw new InternalAuthError();
  }

  return { orgId, userId, projectId, teamId };
}

/**
 * Like `extractInternalContext` but requires `x-project-id` to be
 * present. Use this in endpoints that cannot resolve a project from
 * the request body (e.g. file upload/download routes).
 */
export function extractStrictInternalContext(
  request: NextRequest,
): StrictInternalContext {
  const ctx = extractInternalContext(request);
  if (!ctx.projectId) {
    throw new InternalAuthError();
  }
  return ctx as StrictInternalContext;
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
