import 'server-only';

import { intersectPrincipals, mergePageContent } from '@ragenai/brain-core';
import db from '@ragenai/prisma-client';

import type { Prisma } from '@/generated/prisma/client';

import type {
  MergeInput,
  ReviewError,
  ReviewResult,
} from '../../contracts/brain-review.types';
import type { ReviewTx } from './decide-on-knowledge-page';
import { startFindingsReconcile } from './start-findings-reconcile';

const PAGE_SELECT = {
  id: true,
  publicId: true,
  status: true,
  content: true,
  contentHash: true,
  accessibleBy: true,
  publishedAt: true,
  updatedAt: true,
  sources: {
    orderBy: { id: 'asc' },
    select: {
      fileId: true,
      documentVersionId: true,
      span: true,
      quote: true,
      hash: true,
    },
  },
} as const;

const ORIGIN_RANK = { INFERRED: 0, AMBIGUOUS: 1, EXTRACTED: 2 } as const;

/**
 * Fold one page into another (spec D2b): the reviewer is looking at a
 * candidate and says it is about the same thing as another page.
 *
 * What happens, all in one transaction with both rows locked:
 *
 * - **The target keeps its title and gains the absorbed page's claims and
 *   sources** (`mergePageContent`), renumbered so every `[n]` still names its
 *   quote; a claim whose quote the target already cites is dropped.
 * - **Its access becomes the narrower of the two** — `intersectPrincipals`,
 *   the rule extraction uses — because the target now carries text from the
 *   absorbed page's sources. A merge never widens; a person does that, with
 *   `WIDEN_ACCESS`.
 * - **It goes back to `CANDIDATE`** if it was approved: it now says things
 *   nobody approved.
 * - **Relations move to the target**, a relation between the two pages is
 *   dropped (it would be a page related to itself), and where both had the
 *   same relation the stronger origin wins.
 * - **The absorbed page is rejected and superseded by the target**, not
 *   deleted: both pages get a `MERGE` row, and the ledger's foreign key would
 *   refuse the delete anyway.
 *
 * Only a candidate is absorbed, and neither page may be published — moving
 * text in or out of the index is Phase E's. The `updatedAt` check is on the
 * absorbed page, the one on the reviewer's screen; the target is locked and
 * its status checked, which is what the merge depends on.
 */
export async function mergeKnowledgePagesCommand(
  input: MergeInput & { orgId: string; actorId: string },
): Promise<ReviewResult> {
  const { orgId, actorId, publicId, targetPublicId } = input;
  if (publicId === targetPublicId) {
    return refuse('unmergeable');
  }

  const result = await db.$transaction(async (tx): Promise<ReviewResult> => {
    // Both rows, in id order, so two merges of the same pair in opposite
    // directions queue instead of deadlocking.
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM knowledge_pages
      WHERE organization_id = ${orgId}
        AND public_id IN (${publicId}::uuid, ${targetPublicId}::uuid)
      ORDER BY id
      FOR UPDATE
    `;
    if (locked.length !== 2) {
      return refuse('not-found');
    }

    const [absorbed, target] = await Promise.all([
      tx.knowledgePage.findFirst({
        where: { organizationId: orgId, publicId },
        select: PAGE_SELECT,
      }),
      tx.knowledgePage.findFirst({
        where: { organizationId: orgId, publicId: targetPublicId },
        select: PAGE_SELECT,
      }),
    ]);
    if (!absorbed || !target) {
      return refuse('not-found');
    }
    if (
      absorbed.updatedAt.toISOString() !==
      new Date(input.expectedUpdatedAt).toISOString()
    ) {
      return refuse('conflict');
    }
    if (absorbed.status !== 'CANDIDATE' || target.status === 'REJECTED') {
      return refuse('invalid-status');
    }
    if (absorbed.publishedAt !== null || target.publishedAt !== null) {
      return refuse('published');
    }

    const merged = mergePageContent(target, absorbed);
    if (!merged.ok) {
      return refuse('unmergeable');
    }
    const accessibleBy = intersectPrincipals(orgId, [
      target.accessibleBy,
      absorbed.accessibleBy,
    ]);

    await tx.knowledgePage.updateMany({
      where: { organizationId: orgId, id: target.id },
      data: {
        content: merged.content,
        contentHash: merged.contentHash,
        accessibleBy,
        status: 'CANDIDATE',
      },
    });
    if (merged.addedSources.length > 0) {
      await tx.knowledgePageSource.createMany({
        data: merged.addedSources.map((source) => ({
          organizationId: orgId,
          pageId: target.id,
          ...source,
        })),
      });
    }
    await moveEdges(tx, orgId, absorbed.id, target.id);
    await tx.knowledgePage.updateMany({
      where: { organizationId: orgId, id: absorbed.id },
      data: { status: 'REJECTED', supersededById: target.id },
    });

    await tx.knowledgeDecision.createMany({
      data: [
        {
          organizationId: orgId,
          pageId: target.id,
          actorId,
          action: 'MERGE',
          publicationGeneration: null,
          before: {
            status: target.status,
            accessibleBy: target.accessibleBy,
            contentHash: target.contentHash,
            sources: target.sources.length,
          },
          after: {
            status: 'CANDIDATE',
            accessibleBy,
            contentHash: merged.contentHash,
            sources: target.sources.length + merged.addedSources.length,
            absorbed: absorbed.publicId,
            duplicates: merged.duplicates,
          } satisfies Prisma.InputJsonObject,
        },
        {
          organizationId: orgId,
          pageId: absorbed.id,
          actorId,
          action: 'MERGE',
          publicationGeneration: null,
          before: { status: absorbed.status },
          after: { status: 'REJECTED', mergedInto: target.publicId },
        },
      ],
    });
    return { success: true, changed: true };
  });

  if (result.success) {
    await startFindingsReconcile(orgId);
  }
  return result;
}

/**
 * Re-point the absorbed page's relations at the target. A relation between
 * the two is dropped; one the target already has keeps the stronger origin,
 * so a relation stated in a source is never downgraded to an inferred one.
 */
async function moveEdges(
  tx: ReviewTx,
  orgId: string,
  absorbedId: number,
  targetId: number,
): Promise<void> {
  const [moving, existing] = await Promise.all([
    tx.knowledgeEdge.findMany({
      where: {
        organizationId: orgId,
        OR: [{ fromPageId: absorbedId }, { toPageId: absorbedId }],
      },
      select: {
        fromPageId: true,
        toPageId: true,
        kind: true,
        origin: true,
        confidence: true,
      },
    }),
    tx.knowledgeEdge.findMany({
      where: {
        organizationId: orgId,
        OR: [{ fromPageId: targetId }, { toPageId: targetId }],
      },
      select: {
        id: true,
        fromPageId: true,
        toPageId: true,
        kind: true,
        origin: true,
      },
    }),
  ]);

  const key = (from: number, to: number, kind: string) =>
    `${from}\u0000${to}\u0000${kind}`;
  const held = new Map(
    existing.map((e) => [key(e.fromPageId, e.toPageId, e.kind), e]),
  );
  const create = new Map<string, Prisma.KnowledgeEdgeCreateManyInput>();

  for (const edge of moving) {
    const fromPageId =
      edge.fromPageId === absorbedId ? targetId : edge.fromPageId;
    const toPageId = edge.toPageId === absorbedId ? targetId : edge.toPageId;
    if (fromPageId === toPageId) {
      continue;
    }
    const k = key(fromPageId, toPageId, edge.kind);
    const current = held.get(k);
    if (current) {
      if (ORIGIN_RANK[edge.origin] > ORIGIN_RANK[current.origin]) {
        await tx.knowledgeEdge.updateMany({
          where: { organizationId: orgId, id: current.id },
          data: { origin: edge.origin },
        });
        current.origin = edge.origin;
      }
      continue;
    }
    const pending = create.get(k);
    if (!pending || ORIGIN_RANK[edge.origin] > ORIGIN_RANK[pending.origin]) {
      create.set(k, {
        organizationId: orgId,
        fromPageId,
        toPageId,
        kind: edge.kind,
        origin: edge.origin,
        confidence: edge.confidence,
      });
    }
  }

  await tx.knowledgeEdge.deleteMany({
    where: {
      organizationId: orgId,
      OR: [{ fromPageId: absorbedId }, { toPageId: absorbedId }],
    },
  });
  if (create.size > 0) {
    await tx.knowledgeEdge.createMany({ data: [...create.values()] });
  }
}

function refuse(error: ReviewError): ReviewResult {
  return { success: false, error };
}
