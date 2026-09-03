import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';

type ResolveInput = {
  publicId: string;
  resolvedBy: string;
  /**
   * Optional org scope. When provided, the update only succeeds if the
   * event belongs to that org — this is how the apps/web org-admin page
   * prevents a malicious admin from resolving another org's events by
   * guessing a publicId. ragen-admin passes `undefined` to bypass.
   */
  organizationId?: string;
};

type ResolveResult =
  | { ok: true }
  | { ok: false; reason: 'not_found' | 'forbidden' | 'already_resolved' };

export async function resolveSecurityEventCommand(
  input: ResolveInput,
): Promise<ResolveResult> {
  const event = await db.securityEvent.findUnique({
    where: { publicId: input.publicId },
    select: { id: true, organizationId: true, resolvedAt: true },
  });

  if (!event) {
    return { ok: false, reason: 'not_found' };
  }

  if (
    input.organizationId !== undefined &&
    event.organizationId !== input.organizationId
  ) {
    logger.warn(
      {
        publicId: input.publicId,
        expectedOrg: input.organizationId,
        actualOrg: event.organizationId,
        resolvedBy: input.resolvedBy,
      },
      'Blocked cross-org attempt to resolve security event',
    );
    return { ok: false, reason: 'forbidden' };
  }

  if (event.resolvedAt) {
    return { ok: false, reason: 'already_resolved' };
  }

  await db.securityEvent.update({
    where: { id: event.id },
    data: {
      resolvedAt: new Date(),
      resolvedBy: input.resolvedBy,
    },
  });

  logger.info(
    { publicId: input.publicId, resolvedBy: input.resolvedBy },
    'Security event resolved',
  );

  return { ok: true };
}
