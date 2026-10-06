import db from '@ragenai/prisma-client';
import type { BrainLanguage } from '../../contracts/brain-language.types';
import type { ReviewQueuePage } from '../../contracts/brain-review-queue.types';
import { getBrainLanguageScopeQuery } from './brain-language-scope';
/** Candidate ids in stable order; detail is loaded only for the selected page. */
export async function getBrainReviewQueueQuery(
  orgId: string,
  language: BrainLanguage | null = null,
): Promise<ReviewQueuePage[]> {
  const scope = await getBrainLanguageScopeQuery(orgId, language);
  const pages = await db.knowledgePage.findMany({
    where: {
      organizationId: orgId,
      status: 'CANDIDATE',
      ...(scope ? { id: { in: scope.pageIds } } : {}),
    },
    orderBy: [{ id: 'asc' }],
    select: {
      publicId: true,
      title: true,
      type: true,
      sources: {
        where: { organizationId: orgId },
        orderBy: { id: 'asc' },
        select: { fileId: true },
      },
    },
  });
  const fileIds = [
    ...new Set(
      pages.flatMap((page) => page.sources.map((source) => source.fileId)),
    ),
  ];
  const files = fileIds.length
    ? await db.userFile.findMany({
        where: { organizationId: orgId, id: { in: fileIds } },
        select: { id: true, fileName: true },
      })
    : [];
  const names = new Map(files.map((file) => [file.id, file.fileName]));
  return pages.map((page) => ({
    publicId: page.publicId,
    title: page.title,
    type: page.type,
    documents: [...new Set(page.sources.map((source) => source.fileId))].map(
      (fileId) => ({ fileId, fileName: names.get(fileId) ?? null }),
    ),
  }));
}
