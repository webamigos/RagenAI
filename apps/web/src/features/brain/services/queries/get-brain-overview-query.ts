import db from '@ragenai/prisma-client';
import type { BrainLanguage } from '../../contracts/brain-language.types';
import type { BrainOverview } from '../../contracts/brain-overview.types';
import type { KnowledgeFindingType } from '../../contracts/brain.types';
import {
  findingsInScope,
  getBrainLanguageScopeQuery,
} from './brain-language-scope';
import { getBrainDocumentsQuery } from './get-brain-documents-query';
import { getBrainStatusCountsQuery } from './get-brain-status-counts-query';
import { getPublicationBacklogQuery } from './get-publication-backlog-query';

/** Global pages and per-file coverage have different denominators: a page
 * citing two documents belongs once to the pipeline, once to each file. */
export async function getBrainOverviewQuery(
  orgId: string,
  language: BrainLanguage | null = null,
): Promise<BrainOverview> {
  const scope = await getBrainLanguageScopeQuery(orgId, language);
  const pageWhere = {
    organizationId: orgId,
    ...(scope ? { id: { in: scope.pageIds } } : {}),
  };
  const [
    documents,
    counts,
    published,
    backlog,
    unownedCandidates,
    findings,
    cited,
  ] = await Promise.all([
    getBrainDocumentsQuery(orgId, language),
    getBrainStatusCountsQuery(orgId, scope),
    db.knowledgePage.count({
      where: { ...pageWhere, publishedAt: { not: null } },
    }),
    getPublicationBacklogQuery(orgId),
    db.knowledgePage.count({
      where: { ...pageWhere, status: 'CANDIDATE', ownerId: null },
    }),
    db.knowledgeFinding.groupBy({
      by: ['type'],
      where: {
        organizationId: orgId,
        status: 'OPEN',
        ...(scope ? findingsInScope(scope) : {}),
      },
      _count: { _all: true },
    }),
    db.knowledgePageSource.findMany({
      where: { organizationId: orgId },
      distinct: ['fileId'],
      select: { fileId: true },
    }),
  ]);
  const filesWithPages = new Set(cited.map((source) => source.fileId));
  const openFindings: Partial<Record<KnowledgeFindingType, number>> = {};
  for (const finding of findings) {
    openFindings[finding.type] = finding._count._all;
  }
  return {
    documents: documents.length,
    emptyDocuments: documents.filter((file) => !filesWithPages.has(file.fileId))
      .length,
    candidates: counts.pages.CANDIDATE,
    approved: counts.pages.APPROVED,
    published,
    awaitingPublication: backlog.pending,
    unownedCandidates,
    openFindings,
    topDocuments: documents
      .filter((file) => file.candidatePages > 0)
      .sort(
        (a, b) =>
          b.candidatePages - a.candidatePages ||
          a.fileName.localeCompare(b.fileName) ||
          a.fileId.localeCompare(b.fileId),
      )
      .slice(0, 8),
  };
}
