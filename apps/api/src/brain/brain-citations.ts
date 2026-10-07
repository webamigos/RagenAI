import {
  canReadPage,
  fileAccessWhere,
  shapeBrainCitations,
  type BrainCitations,
  type DocumentActor,
} from '@ragenai/rag-core';

import type { PrismaService } from '../prisma/prisma.service.js';

/**
 * The second level of a Brain citation (spec E8) for an API answer: for each
 * cited file that is a published page, the page's title and the source
 * documents behind it that the caller may open.
 *
 * The query is this app's, because the Prisma client is; the decisions — who
 * may read a page, what a reader who may read it but not all of its sources is
 * shown, and which files `actor` may open — are rag-core's, the same functions
 * `apps/web` calls, so the panel and the API cannot answer differently.
 */
export async function getBrainCitations(
  client: PrismaService['client'],
  orgId: string,
  actor: DocumentActor,
  fileIds: string[],
): Promise<BrainCitations> {
  if (actor.scope === 'none' || fileIds.length === 0) {
    return {};
  }
  const pages = await client.knowledgePage.findMany({
    where: {
      organizationId: orgId,
      publishedFileId: { in: [...new Set(fileIds)].slice(0, 50) },
      publishedAt: { not: null },
    },
    select: {
      title: true,
      accessibleBy: true,
      publishedFileId: true,
      sources: {
        where: { organizationId: orgId, sourceDeletedAt: null },
        orderBy: { id: 'asc' },
        select: { fileId: true, span: true },
      },
    },
  });
  const readable = pages.filter((p) =>
    canReadPage(orgId, actor, p.accessibleBy),
  );
  if (readable.length === 0) {
    return {};
  }

  const sourceFileIds = [
    ...new Set(readable.flatMap((p) => p.sources.map((s) => s.fileId))),
  ];
  const files = sourceFileIds.length
    ? await client.userFile.findMany({
        where: {
          organizationId: orgId,
          id: { in: sourceFileIds },
          ...(fileAccessWhere(actor) as Record<string, unknown>),
        },
        select: {
          id: true,
          fileName: true,
          documentId: true,
          document: { select: { id: true } },
        },
      })
    : [];

  return shapeBrainCitations(
    orgId,
    actor,
    readable,
    files.map((f) => ({
      id: f.id,
      fileName: f.fileName,
      documentId: f.document?.id ?? f.documentId ?? null,
    })),
  );
}
