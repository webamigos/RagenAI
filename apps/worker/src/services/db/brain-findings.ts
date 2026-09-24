import {
  COMPUTED_FINDING_TYPES,
  CURATED_PAGE_STATUSES,
  type ExistingFinding,
  type FindingsPlan,
  type FindingsSnapshot,
  type SnapshotFile,
} from '@ragenai/brain-core';

import type { Prisma } from '../../../generated/prisma/index.js';
import { getPrisma } from './prisma.js';

/**
 * The reads and writes behind Brain's computed findings (spec C2). The rules
 * are `brain-core`'s (`detectPageFindings`, `reconcileFindings`); this file
 * only fetches what they read and writes what they decide. Every query
 * carries `organizationId` at the top level.
 */

/**
 * Everything `detectPageFindings` reads, for one organization.
 *
 * Document text is read only for the files whose active version differs from
 * one a source is pinned to — the only case the rule needs it, and the rare
 * one. Reading every document's content to learn that nothing moved would
 * make this the heaviest query in the feature for no answer.
 */
export async function loadFindingsSnapshot(
  orgId: string,
): Promise<FindingsSnapshot> {
  const prisma = getPrisma();
  const [pages, edges, sources, members] = await Promise.all([
    prisma.knowledgePage.findMany({
      where: { organizationId: orgId, status: { not: 'REJECTED' } },
      select: {
        id: true,
        type: true,
        status: true,
        ownerId: true,
        verifyEvery: true,
        lastVerifiedAt: true,
        publishedAt: true,
        decisions: {
          where: { organizationId: orgId, action: 'APPROVE' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    }),
    prisma.knowledgeEdge.findMany({
      where: { organizationId: orgId },
      select: { fromPageId: true, toPageId: true },
    }),
    prisma.knowledgePageSource.findMany({
      where: {
        organizationId: orgId,
        page: { status: { in: [...CURATED_PAGE_STATUSES] } },
      },
      select: {
        id: true,
        pageId: true,
        fileId: true,
        documentVersionId: true,
        quote: true,
        sourceDeletedAt: true,
      },
    }),
    prisma.member.findMany({
      where: { organizationId: orgId },
      select: { userId: true },
    }),
  ]);

  const fileIds = [...new Set(sources.map((s) => s.fileId))];
  const files = fileIds.length
    ? await prisma.userFile.findMany({
        where: { organizationId: orgId, id: { in: fileIds } },
        select: {
          id: true,
          documentId: true,
          document: { select: { id: true } },
        },
      })
    : [];
  // The relation first, as the page view and extraction read it (spec D1):
  // `UserFile.documentId` is a copy ingest writes after binding, and a file
  // whose copy is empty still has a document whose version can move.
  const documentOf = (f: (typeof files)[number]) =>
    f.document?.id ?? f.documentId ?? null;
  const documentIds = files.flatMap((f) => {
    const id = documentOf(f);
    return id ? [id] : [];
  });
  const active = documentIds.length
    ? await prisma.documentVersion.findMany({
        where: {
          organizationId: orgId,
          documentId: { in: documentIds },
          isActive: true,
        },
        select: { id: true, documentId: true },
      })
    : [];
  const activeByDocument = new Map(active.map((v) => [v.documentId, v.id]));

  const pinnedByFile = new Map<string, Set<string>>();
  for (const source of sources) {
    const set = pinnedByFile.get(source.fileId) ?? new Set<string>();
    set.add(source.documentVersionId);
    pinnedByFile.set(source.fileId, set);
  }
  const moved = new Map<string, string>();
  for (const file of files) {
    const documentId = documentOf(file);
    const versionId = documentId ? activeByDocument.get(documentId) : undefined;
    if (
      versionId &&
      [...(pinnedByFile.get(file.id) ?? [])].some((v) => v !== versionId)
    ) {
      moved.set(file.id, versionId);
    }
  }
  const texts = moved.size
    ? await prisma.documentVersion.findMany({
        where: { organizationId: orgId, id: { in: [...moved.values()] } },
        select: { id: true, content: true },
      })
    : [];
  const textByVersion = new Map(texts.map((t) => [t.id, t.content]));

  const fileStates = new Map<string, SnapshotFile>();
  for (const file of files) {
    const documentId = documentOf(file);
    const versionId = documentId
      ? (activeByDocument.get(documentId) ?? null)
      : null;
    fileStates.set(file.id, {
      activeVersionId: versionId,
      activeText: versionId ? (textByVersion.get(versionId) ?? null) : null,
    });
  }

  return {
    pages: pages.map(({ decisions, ...page }) => ({
      ...page,
      approvedAt: decisions[0]?.createdAt ?? null,
    })),
    edges,
    sources,
    files: fileStates,
    members: new Set(members.map((m) => m.userId)),
  };
}

/** The stored rows of the four computed types, in every status. */
export async function loadComputedFindings(
  orgId: string,
): Promise<ExistingFinding[]> {
  return getPrisma().knowledgeFinding.findMany({
    where: {
      organizationId: orgId,
      type: { in: [...COMPUTED_FINDING_TYPES] },
    },
    select: {
      id: true,
      type: true,
      status: true,
      pageIds: true,
      detail: true,
      severity: true,
    },
  });
}

/**
 * Write a reconciliation plan in one transaction, so the inbox never shows a
 * half-applied view — a finding resolved without its replacement created.
 *
 * Updates and resolutions are conditioned on `status: 'OPEN'`: a person who
 * dismissed a finding between the read and this write has the last word, and
 * the plan does not reopen or re-resolve it.
 */
export async function applyFindingsPlan(
  orgId: string,
  plan: FindingsPlan,
): Promise<{ created: number; updated: number; resolved: number }> {
  return getPrisma().$transaction(async (tx) => {
    let created = 0;
    if (plan.create.length > 0) {
      created = (
        await tx.knowledgeFinding.createMany({
          data: plan.create.map((finding) => ({
            organizationId: orgId,
            type: finding.type,
            severity: finding.severity,
            pageIds: finding.pageIds,
            fileId: finding.fileId,
            detail: finding.detail as unknown as Prisma.InputJsonValue,
          })),
        })
      ).count;
    }
    let updated = 0;
    for (const { id, finding } of plan.update) {
      updated += (
        await tx.knowledgeFinding.updateMany({
          where: { organizationId: orgId, id, status: 'OPEN' },
          data: {
            severity: finding.severity,
            fileId: finding.fileId,
            detail: finding.detail as unknown as Prisma.InputJsonValue,
          },
        })
      ).count;
    }
    let resolved = 0;
    if (plan.resolve.length > 0) {
      resolved = (
        await tx.knowledgeFinding.updateMany({
          where: {
            organizationId: orgId,
            id: { in: plan.resolve },
            status: 'OPEN',
          },
          data: { status: 'RESOLVED', resolvedAt: new Date() },
        })
      ).count;
    }
    return { created, updated, resolved };
  });
}

/**
 * The reconciliation sweep (spec E5): mark every source of this organization
 * whose file no longer exists, and that nothing has marked yet.
 *
 * The delete path marks sources itself — a trigger on `user_files` does, in
 * the delete's own transaction — so this is the safety net the spec says is
 * not optional: files deleted before that trigger existed, and any path that
 * got round it. Idempotent: a marked source is left with its first timestamp.
 */
export async function markSourcesOfDeletedFiles(
  orgId: string,
): Promise<number> {
  return getPrisma().$executeRaw`
    UPDATE knowledge_page_sources AS s
       SET source_deleted_at = now()
     WHERE s.organization_id = ${orgId}
       AND s.source_deleted_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM user_files f WHERE f.id = s.file_id)
  `;
}
