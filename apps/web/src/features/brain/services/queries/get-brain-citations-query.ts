import db from '@ragenai/prisma-client';

import {
  fileAccessWhere,
  type DocumentActor,
} from '@/features/documents/services/queries/document-access';

import type { BrainCitations } from '../../contracts/brain-citations.types';

/**
 * The second level of a Brain citation (spec E8): for each cited file that
 * is a published page, the page's title and the source documents behind it.
 *
 * Two checks, because two things are shown:
 *
 * - **The page** by its own `accessibleBy`, matched against the reader's
 *   principals — the rule its chunks were retrieved under. The vehicle file's
 *   sharing is not the question: a reader who retrieved the page through a
 *   team principal may not pass `fileAccessWhere` on that file, and still
 *   read the page legitimately.
 * - **Each source document** by `fileAccessWhere`, the one predicate every
 *   by-id file read uses. A page widened to someone who may not see all of
 *   its sources shows them the page and only the sources they may open —
 *   never the names of the others (spec E8: "gets the page and no source
 *   list").
 */
export async function getBrainCitationsQuery(
  orgId: string,
  actor: DocumentActor,
  fileIds: string[],
): Promise<BrainCitations> {
  if (actor.scope === 'none' || fileIds.length === 0) {
    return {};
  }
  const pages = await db.knowledgePage.findMany({
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
    ? await db.userFile.findMany({
        where: {
          organizationId: orgId,
          id: { in: sourceFileIds },
          ...fileAccessWhere(actor),
        },
        select: {
          id: true,
          fileName: true,
          documentId: true,
          document: { select: { id: true } },
        },
      })
    : [];
  const byId = new Map(files.map((f) => [f.id, f]));

  const result: BrainCitations = {};
  for (const page of readable) {
    const seen = new Set<string>();
    const sources: BrainCitations[string]['sources'] = [];
    for (const s of page.sources) {
      const file = byId.get(s.fileId);
      const key = `${s.fileId}\u0000${s.span}`;
      if (!file || seen.has(key)) {
        continue;
      }
      seen.add(key);
      sources.push({
        fileName: file.fileName,
        documentId: file.document?.id ?? file.documentId ?? null,
        span: s.span,
      });
    }
    result[page.publishedFileId!] = { pageTitle: page.title, sources };
  }
  return result;
}

/** Whether the reader matches a principal on the page, as retrieval matches it. */
export function canReadPage(
  orgId: string,
  actor: DocumentActor,
  accessibleBy: string[],
): boolean {
  if (actor.scope === 'organization') {
    return true;
  }
  const mine = new Set([
    `org:${orgId}`,
    ...(actor.userId ? [`user:${actor.userId}`] : []),
    ...actor.teamIds.map((t) => `team:${t}`),
  ]);
  return accessibleBy.some((p) => mine.has(p));
}
