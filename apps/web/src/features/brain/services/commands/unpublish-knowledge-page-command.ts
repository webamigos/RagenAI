import 'server-only';

import db from '@ragenai/prisma-client';

import { deleteFileFromVectorStore } from '@/app/api/upload/services/TableService';
import { logger } from '@/app/lib/utils/logger';

import type {
  PageDecisionInput,
  ReviewResult,
} from '../../contracts/brain-review.types';
import { startFindingsReconcile } from './start-findings-reconcile';

/**
 * Take a published page out of the index (spec E3). The page stays approved
 * and keeps its `UserFile` — `DocumentCitation` and `DocumentRetrieval`
 * cascade from it, so deleting it would erase every past answer that cited
 * the page.
 *
 * Three steps, in the order that leaves less retrievable at every
 * interruption, never more:
 *
 * 1. **Bump the generation** (its own short transaction). A publication still
 *    writing sees it and removes what it wrote, so the delete below cannot be
 *    raced by chunks landing after it.
 * 2. **Delete the file's chunks.** If this fails nothing else is recorded; the
 *    page still reads published and answers nothing, and trying again is safe.
 * 3. **One transaction**: the file `WITHDRAWN`, `publishedAt` cleared, the
 *    `UNPUBLISH` decision at the bumped generation. Never before the delete:
 *    clearing `publishedAt` first would leave chunks in the index that the
 *    page's own row says are not published.
 */
export async function unpublishKnowledgePageCommand(
  input: PageDecisionInput & { orgId: string; actorId: string },
): Promise<ReviewResult> {
  const { orgId, actorId, publicId } = input;

  type Bumped =
    | { error: 'not-found' | 'conflict' | 'invalid-status' }
    | { pageId: number; fileId: string; generation: number };
  const bumped = await db.$transaction(async (tx): Promise<Bumped> => {
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM knowledge_pages
      WHERE public_id = ${publicId}::uuid AND organization_id = ${orgId}
      FOR UPDATE
    `;
    const id = locked[0]?.id;
    if (id === undefined) {
      return { error: 'not-found' };
    }
    const page = await tx.knowledgePage.findFirst({
      where: { organizationId: orgId, id },
      select: {
        id: true,
        publishedAt: true,
        publishedFileId: true,
        publicationGeneration: true,
        updatedAt: true,
      },
    });
    if (!page) {
      return { error: 'not-found' };
    }
    if (
      page.updatedAt.toISOString() !==
      new Date(input.expectedUpdatedAt).toISOString()
    ) {
      return { error: 'conflict' };
    }
    if (!page.publishedAt || !page.publishedFileId) {
      return { error: 'invalid-status' };
    }
    const generation = page.publicationGeneration + 1;
    await tx.knowledgePage.updateMany({
      where: { organizationId: orgId, id: page.id },
      data: { publicationGeneration: generation },
    });
    return { pageId: page.id, fileId: page.publishedFileId, generation };
  });
  if ('error' in bumped) {
    return { success: false, error: bumped.error };
  }

  try {
    await deleteFileFromVectorStore(bumped.fileId, orgId);
  } catch (error) {
    if (!isMissingCollection(error)) {
      logger.error(
        {
          orgId,
          pageId: publicId,
          error: error instanceof Error ? error.message : String(error),
        },
        'brain: could not remove a page from the index; it stays published',
      );
      return { success: false, error: 'index-unavailable' };
    }
  }

  const finished = await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM knowledge_pages
      WHERE id = ${bumped.pageId} AND organization_id = ${orgId}
      FOR UPDATE
    `;
    const now = await tx.knowledgePage.findFirst({
      where: { organizationId: orgId, id: bumped.pageId },
      select: { publicationGeneration: true },
    });
    if (now?.publicationGeneration !== bumped.generation) {
      // Someone published again after step 1: theirs is the operation that
      // completes, and this one records nothing.
      return false;
    }
    await tx.userFile.updateMany({
      where: { organizationId: orgId, id: bumped.fileId },
      data: { embeddingStatus: 'WITHDRAWN' },
    });
    await tx.knowledgePage.updateMany({
      where: { organizationId: orgId, id: bumped.pageId },
      data: { publishedAt: null },
    });
    await tx.knowledgeDecision.create({
      data: {
        organizationId: orgId,
        pageId: bumped.pageId,
        actorId,
        action: 'UNPUBLISH',
        publicationGeneration: bumped.generation,
        before: { published: true },
        after: { published: false, fileId: bumped.fileId },
      },
    });
    return true;
  });
  if (!finished) {
    return { success: false, error: 'conflict' };
  }
  await startFindingsReconcile(orgId);
  return { success: true, changed: true };
}

/** An organization with nothing indexed yet has no collection to delete from. */
function isMissingCollection(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  const message = error instanceof Error ? error.message : '';
  return status === 404 || /not found/i.test(message);
}
