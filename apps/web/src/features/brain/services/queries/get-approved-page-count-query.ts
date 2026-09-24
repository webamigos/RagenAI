import db from '@ragenai/prisma-client';

/** How many approved pages the organization has — what "publish all" offers. */
export async function getApprovedPageCountQuery(
  orgId: string,
): Promise<number> {
  return db.knowledgePage.count({
    where: { organizationId: orgId, status: 'APPROVED' },
  });
}
