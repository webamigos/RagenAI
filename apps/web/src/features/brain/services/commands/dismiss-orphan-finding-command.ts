import 'server-only';
import db from '@ragenai/prisma-client';
import type { ReviewResult } from '../../contracts/brain-review.types';

/** A dismissed orphan retains its detail fingerprint so reconciliation respects the decision. */
export async function dismissOrphanFindingCommand(input: {
  orgId: string;
  findingPublicId: string;
}): Promise<ReviewResult> {
  const result = await db.knowledgeFinding.updateMany({
    where: {
      organizationId: input.orgId,
      publicId: input.findingPublicId,
      type: 'ORPHAN',
      status: 'OPEN',
    },
    data: { status: 'DISMISSED', resolvedAt: new Date() },
  });
  return result.count
    ? { success: true, changed: true }
    : { success: false, error: 'not-found' };
}
