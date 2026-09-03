import db from '@ragenai/prisma-client';
import type { SecurityEventRow } from '../../contracts/security-event.types';

type GetInput = {
  publicId: string;
  /**
   * Org scope guard. Same contract as listSecurityEventsQuery — apps/web
   * passes the active org, ragen-admin passes undefined.
   */
  organizationId?: string;
};

export async function getSecurityEventQuery(
  input: GetInput,
): Promise<SecurityEventRow | null> {
  const item = await db.securityEvent.findUnique({
    where: { publicId: input.publicId },
    include: {
      organization: { select: { name: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!item) {
    return null;
  }

  if (
    input.organizationId !== undefined &&
    item.organizationId !== input.organizationId
  ) {
    // Hide cross-org events from org admins by returning null rather than
    // leaking "exists but forbidden". Matches IDOR prevention elsewhere.
    return null;
  }

  return {
    id: item.id,
    publicId: item.publicId,
    eventType: item.eventType,
    severity: item.severity,
    source: item.source,
    organizationId: item.organizationId,
    organizationName: item.organization?.name ?? null,
    userId: item.userId,
    user: item.user
      ? { id: item.user.id, name: item.user.name, email: item.user.email }
      : null,
    ipAddress: item.ipAddress,
    userAgent: item.userAgent,
    requestId: item.requestId,
    metadata: item.metadata,
    resolvedAt: item.resolvedAt?.toISOString() ?? null,
    resolvedBy: item.resolvedBy,
    createdAt: item.createdAt.toISOString(),
  };
}
