import { getPrisma } from './prisma.js';

/**
 * Reads and writes for publishing a knowledge page (spec E2). Every query
 * carries `organizationId` at the top level, for the tenant-scope guard.
 */

export type PageForPublication = {
  id: number;
  publicId: string;
  title: string;
  content: string;
  accessibleBy: string[];
  publishedAt: Date | null;
  publicationGeneration: number;
  publishedFileId: string | null;
  fileName: string | null;
};

export async function getPageForPublication(
  orgId: string,
  publicId: string,
): Promise<PageForPublication | null> {
  const page = await getPrisma().knowledgePage.findFirst({
    where: { organizationId: orgId, publicId },
    select: {
      id: true,
      publicId: true,
      title: true,
      content: true,
      accessibleBy: true,
      publishedAt: true,
      publicationGeneration: true,
      publishedFileId: true,
      publishedFile: { select: { fileName: true } },
    },
  });
  if (!page) {
    return null;
  }
  const { publishedFile, ...rest } = page;
  return { ...rest, fileName: publishedFile?.fileName ?? null };
}

/** The page's current generation, or null if it is no longer published. */
export async function currentPublicationGeneration(
  orgId: string,
  pageId: number,
): Promise<number | null> {
  const page = await getPrisma().knowledgePage.findFirst({
    where: { organizationId: orgId, id: pageId },
    select: { publishedAt: true, publicationGeneration: true },
  });
  return page && page.publishedAt ? page.publicationGeneration : null;
}

/**
 * The last step of a publication: the file reads `COMPLETED` — but only if
 * the page is still published at the generation this run was given. The
 * check and the write are one statement, so an unpublish that commits in
 * between cannot be overwritten by a publication that has already lost.
 */
export async function completePublication(input: {
  orgId: string;
  pageId: number;
  fileId: string;
  generation: number;
}): Promise<boolean> {
  const updated = await getPrisma().$executeRaw`
    UPDATE user_files AS f
       SET embedding_status = 'COMPLETED',
           embedding_completed_at = now()
     WHERE f.id = ${input.fileId}::uuid
       AND f.organization_id = ${input.orgId}
       AND EXISTS (
         SELECT 1 FROM knowledge_pages p
          WHERE p.id = ${input.pageId}
            AND p.organization_id = ${input.orgId}
            AND p.published_file_id = f.id
            AND p.published_at IS NOT NULL
            AND p.publication_generation = ${input.generation}
       )
  `;
  return updated === 1;
}

/**
 * A publication that gave up: its file reads `FAILED` — but only while the
 * page is still published at the generation that failed, so a newer run or
 * a withdrawal is never overwritten by an old run's death. Without this a
 * dead run left the file `STARTED` and the panel said "being written" for
 * good.
 */
export async function markPublicationFailed(input: {
  orgId: string;
  pagePublicId: string;
  generation: number;
}): Promise<boolean> {
  const updated = await getPrisma().$executeRaw`
    UPDATE user_files AS f
       SET embedding_status = 'FAILED'
     WHERE f.organization_id = ${input.orgId}
       AND f.embedding_status <> 'COMPLETED'
       AND EXISTS (
         SELECT 1 FROM knowledge_pages p
          WHERE p.public_id = ${input.pagePublicId}::uuid
            AND p.organization_id = ${input.orgId}
            AND p.published_file_id = f.id
            AND p.published_at IS NOT NULL
            AND p.publication_generation = ${input.generation}
       )
  `;
  return updated === 1;
}
