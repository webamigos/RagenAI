import { randomUUID } from 'node:crypto';
import db from '@ragenai/prisma-client';
import type { BrainProposal } from '@/features/brain-assistant/contracts/brain-assistant.types';

type RelationProposal = Extract<BrainProposal, { action: 'ADD_RELATIONS' }>;
/** Shared live source documents suggest a connection, never prove it. Three batched reads. */
export async function getOrphanRelationsQuery(
  orgId: string,
  findingPublicIds: string[],
): Promise<Map<string, RelationProposal>> {
  const result = new Map<string, RelationProposal>();
  if (!findingPublicIds.length) {
    return result;
  }
  const findings = await db.knowledgeFinding.findMany({
    where: {
      organizationId: orgId,
      publicId: { in: findingPublicIds },
      type: 'ORPHAN',
      status: 'OPEN',
    },
    select: { publicId: true, pageIds: true },
  });
  const pageIds = [
    ...new Set(
      findings
        .filter((finding) => finding.pageIds.length === 1)
        .flatMap((finding) => finding.pageIds),
    ),
  ];
  if (!pageIds.length) {
    return result;
  }
  const select = {
    id: true,
    publicId: true,
    title: true,
    updatedAt: true,
    sources: {
      where: { organizationId: orgId, sourceDeletedAt: null },
      select: { fileId: true },
    },
  } as const;
  const pages = await db.knowledgePage.findMany({
    where: {
      organizationId: orgId,
      id: { in: pageIds },
      status: { not: 'REJECTED' },
    },
    select,
  });
  const fileIds = [
    ...new Set(
      pages.flatMap((page) =>
        page.sources.flatMap((source) =>
          source.fileId ? [source.fileId] : [],
        ),
      ),
    ),
  ];
  if (!fileIds.length) {
    return result;
  }
  const candidates = await db.knowledgePage.findMany({
    where: {
      organizationId: orgId,
      status: { not: 'REJECTED' },
      sources: {
        some: {
          organizationId: orgId,
          fileId: { in: fileIds },
          sourceDeletedAt: null,
        },
      },
    },
    select,
    orderBy: [{ title: 'asc' }, { id: 'asc' }],
    take: 1000,
  });
  for (const finding of findings) {
    if (finding.pageIds.length !== 1) {
      continue;
    }
    const page = pages.find((page) => page.id === finding.pageIds[0]);
    if (!page) {
      continue;
    }
    const ownFiles = new Set(page.sources.map((source) => source.fileId));
    const targets = candidates
      .filter(
        (candidate) =>
          candidate.id !== page.id &&
          candidate.sources.some(
            (source) => source.fileId && ownFiles.has(source.fileId),
          ),
      )
      .slice(0, 5);
    if (!targets.length) {
      continue;
    }
    result.set(finding.publicId, {
      id: randomUUID(),
      action: 'ADD_RELATIONS',
      reason: 'shared-source-document',
      outcome: null,
      page: {
        publicId: page.publicId,
        title: page.title,
        updatedAt: page.updatedAt.toISOString(),
      },
      targets: targets.map((target) => ({
        publicId: target.publicId,
        title: target.title,
        updatedAt: target.updatedAt.toISOString(),
        kind: 'related to',
      })),
    });
  }
  return result;
}
