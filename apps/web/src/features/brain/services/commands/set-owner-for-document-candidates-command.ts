import 'server-only';
import db from '@ragenai/prisma-client';
import type { ReviewResult } from '../../contracts/brain-review.types';
import { isOrgMember } from './decide-on-knowledge-page';
import { startFindingsReconcile } from './start-findings-reconcile';
/** One explicit bulk act, one SET_OWNER ledger row for every changed candidate. */
export async function setOwnerForDocumentCandidatesCommand(input: {
  orgId: string;
  actorId: string;
  fileId: string;
  ownerId: string;
}): Promise<ReviewResult> {
  const { orgId, actorId, fileId, ownerId } = input;
  const result = await db.$transaction(
    async (tx): Promise<ReviewResult> => {
      const file = await tx.userFile.findFirst({
        where: { organizationId: orgId, id: fileId },
        select: { id: true },
      });
      if (!file) {
        return { success: false, error: 'not-found' };
      }
      if (!(await isOrgMember(tx, orgId, ownerId))) {
        return { success: false, error: 'owner-not-member' };
      }
      const locked = await tx.$queryRaw<{ id: number }[]>`
   SELECT p.id FROM knowledge_pages p
   WHERE p.organization_id = ${orgId} AND p.status = 'CANDIDATE'
   AND EXISTS (SELECT 1 FROM knowledge_page_sources s WHERE s.organization_id = ${orgId} AND s.page_id = p.id AND s.file_id = ${fileId}::uuid)
   ORDER BY p.id FOR UPDATE OF p
  `;
      const pages = await tx.knowledgePage.findMany({
        where: {
          organizationId: orgId,
          status: 'CANDIDATE',
          id: { in: locked.map((page) => page.id) },
        },
        select: { id: true, ownerId: true, publishedFileId: true },
      });
      let changed = false;
      for (const page of pages) {
        if (page.ownerId === ownerId) {
          continue;
        }
        await tx.knowledgePage.updateMany({
          where: { organizationId: orgId, id: page.id },
          data: { ownerId },
        });
        if (page.publishedFileId) {
          await tx.userFile.updateMany({
            where: { organizationId: orgId, id: page.publishedFileId },
            data: { ownerId },
          });
        }
        await tx.knowledgeDecision.create({
          data: {
            organizationId: orgId,
            pageId: page.id,
            actorId,
            action: 'SET_OWNER',
            publicationGeneration: null,
            before: { ownerId: page.ownerId },
            after: { ownerId },
          },
        });
        changed = true;
      }
      return { success: true, changed };
    },
    { timeout: 30000 },
  );
  if (result.success && result.changed) {
    await startFindingsReconcile(orgId);
  }
  return result;
}
