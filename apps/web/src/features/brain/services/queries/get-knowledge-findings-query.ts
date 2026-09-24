import db from '@ragenai/prisma-client';

import { BRAIN_LIST_LIMIT } from '../../constants';
import { listSkip } from '../../utils/list-page';
import type {
  KnowledgeFindingList,
  KnowledgeFindingListItem,
  KnowledgeFindingStatus,
  KnowledgeFindingType,
  PageRef,
} from '../../contracts/brain.types';
import {
  contradictionSourceIds,
  staleFileIds,
  summarizeFinding,
} from '../../utils/summarize-finding';

type FindingRow = {
  publicId: string;
  type: KnowledgeFindingType;
  severity: KnowledgeFindingListItem['severity'];
  status: KnowledgeFindingStatus;
  detectedAt: Date;
  pageIds: number[];
  fileId: string | null;
  detail: unknown;
};

const FINDING_SELECT = {
  publicId: true,
  type: true,
  severity: true,
  status: true,
  detectedAt: true,
  pageIds: true,
  fileId: true,
  detail: true,
} as const;

/**
 * The organization's findings in one status, most severe and newest first
 * (spec D1). Read-only; acting on them is D2 and D3.
 */
export async function getKnowledgeFindingsQuery(
  orgId: string,
  status: KnowledgeFindingStatus,
  page = 1,
): Promise<KnowledgeFindingList> {
  const where = { organizationId: orgId, status };
  const [rows, total] = await Promise.all([
    db.knowledgeFinding.findMany({
      where,
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }, { id: 'desc' }],
      skip: listSkip(page),
      take: BRAIN_LIST_LIMIT,
      select: FINDING_SELECT,
    }),
    db.knowledgeFinding.count({ where }),
  ]);
  return { items: await describeFindings(orgId, rows as FindingRow[]), total };
}

/** A page's open findings, for its detail view. */
export async function getPageFindingsQuery(
  orgId: string,
  pageId: number,
): Promise<KnowledgeFindingListItem[]> {
  const rows = await db.knowledgeFinding.findMany({
    where: { organizationId: orgId, status: 'OPEN', pageIds: { has: pageId } },
    orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
    select: FINDING_SELECT,
  });
  return describeFindings(orgId, rows as FindingRow[]);
}

/**
 * Resolve what finding rows name — pages, files, cited passages — in one
 * query per kind, all scoped to the organization. A page, file or passage
 * that no longer exists is left out rather than shown as a broken link.
 */
async function describeFindings(
  orgId: string,
  rows: FindingRow[],
): Promise<KnowledgeFindingListItem[]> {
  if (rows.length === 0) {
    return [];
  }
  const pageIds = [...new Set(rows.flatMap((r) => r.pageIds))];
  const sourceIds = [
    ...new Set(rows.flatMap((r) => contradictionSourceIds(r.detail))),
  ];
  const fileIds = [
    ...new Set(
      rows.flatMap((r) => [
        ...(r.fileId ? [r.fileId] : []),
        ...staleFileIds(r.detail),
      ]),
    ),
  ];

  const [pages, sources, files] = await Promise.all([
    pageIds.length
      ? db.knowledgePage.findMany({
          where: { organizationId: orgId, id: { in: pageIds } },
          select: { id: true, publicId: true, title: true },
        })
      : [],
    sourceIds.length
      ? db.knowledgePageSource.findMany({
          where: { organizationId: orgId, id: { in: sourceIds } },
          select: { id: true, quote: true },
        })
      : [],
    fileIds.length
      ? db.userFile.findMany({
          where: { organizationId: orgId, id: { in: fileIds } },
          select: {
            id: true,
            fileName: true,
            documentId: true,
            document: { select: { id: true } },
          },
        })
      : [],
  ]);

  const pageById = new Map<number, PageRef>(
    pages.map((p) => [p.id, { publicId: p.publicId, title: p.title }]),
  );
  const fileById = new Map(files.map((f) => [f.id, f]));
  const lookups = {
    quotes: new Map(sources.map((s) => [s.id, s.quote])),
    fileNames: new Map(files.map((f) => [f.id, f.fileName])),
  };

  return rows.map((row) => {
    const file = row.fileId ? fileById.get(row.fileId) : undefined;
    return {
      publicId: row.publicId,
      type: row.type,
      severity: row.severity,
      status: row.status,
      detectedAt: row.detectedAt.toISOString(),
      pages: row.pageIds.flatMap((id) => {
        const page = pageById.get(id);
        return page ? [page] : [];
      }),
      file: file
        ? {
            name: file.fileName,
            // The relation first; the column is a copy (see the page query).
            documentId: file.document?.id ?? file.documentId,
          }
        : null,
      summary: summarizeFinding(row.type, row.detail, lookups),
    };
  });
}
