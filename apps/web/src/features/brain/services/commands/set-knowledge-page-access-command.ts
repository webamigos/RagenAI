import 'server-only';

import { randomUUID } from 'node:crypto';

import { isWidening } from '@ragenai/brain-core';
import db from '@ragenai/prisma-client';

import { deleteFileFromVectorStore } from '@/app/api/upload/services/TableService';
import { logger } from '@/app/lib/utils/logger';
import { jobs } from '@/libs/jobs';

import type {
  ReviewError,
  ReviewResult,
  SetAccessInput,
} from '../../contracts/brain-review.types';
import { normalizeAccess, sameAccess } from '../../utils/normalize-access';
import {
  decideOnKnowledgePage,
  type ReviewTx,
} from './decide-on-knowledge-page';
import { startFindingsReconcile } from './start-findings-reconcile';

type Resolved = { next: string[]; widens: boolean } | ReviewError | null;

/**
 * Change who a page is open to (spec D2, "The permission rule, stated once").
 *
 * **The server decides whether a change widens, never the client.** A change
 * that lets anyone read the page who could not before is `WIDEN_ACCESS`,
 * even if it also removes others, and is refused as `confirm-widening`
 * unless the reviewer confirmed it. Anything else is `SET_ACCESS`. The
 * classification is `isWidening` from `@ragenai/brain-core`, the same
 * package that computed the narrow default at extraction, so "narrower" means
 * one thing on both sides.
 *
 * **On a published page the change reaches the chunks, or it has not
 * happened** (spec E4). A change that rewrote only the row would be a
 * revocation the ledger records and retrieval ignores. So a published page
 * goes the way a withdrawal does and then comes back:
 *
 * 1. Bump the publication generation. A publication still writing sees it and
 *    takes back what it wrote.
 * 2. Delete the page's chunks.
 * 3. In one transaction, write the new access, set the file back to being
 *    written, and record the decision.
 * 4. Queue the chunks again at that generation. They carry the new principals.
 *
 * Between steps 2 and 4 the page answers nothing, which is stricter than
 * either the old or the new access. That makes it the right window for both
 * directions: a narrowing never leaves the removed readers able to retrieve
 * the page, and a widening never serves the new readers before the ledger says
 * they may.
 */
export async function setKnowledgePageAccessCommand(
  input: SetAccessInput & { orgId: string; actorId: string },
): Promise<ReviewResult> {
  const result = await decideOnKnowledgePage(input, async (page, tx) => {
    if (page.status === 'REJECTED') {
      return 'invalid-status';
    }
    if (page.publishedAt !== null) {
      return 'published';
    }
    const resolved = await resolveAccess(tx, input, page.accessibleBy);
    if (resolved === null || typeof resolved === 'string') {
      return resolved;
    }
    return {
      action: resolved.widens ? 'WIDEN_ACCESS' : 'SET_ACCESS',
      data: { accessibleBy: resolved.next },
      before: { accessibleBy: page.accessibleBy },
      after: { accessibleBy: resolved.next },
    };
  });
  if (!result.success && result.error === 'published') {
    return setAccessOnPublishedPage(input);
  }
  return result;
}

/** The new access checked and classified, or a refusal, or null for "no change". */
async function resolveAccess(
  tx: ReviewTx,
  input: SetAccessInput & { orgId: string },
  current: string[],
): Promise<Resolved> {
  const { orgId } = input;
  const userIds = principalIdsOf(input.principals, 'user:');
  const teamIds = principalIdsOf(input.principals, 'team:');
  const [members, teams] = await Promise.all([
    userIds.length
      ? tx.member.findMany({
          where: { organizationId: orgId, userId: { in: userIds } },
          select: { userId: true },
        })
      : [],
    teamIds.length
      ? tx.team.findMany({
          where: { organizationId: orgId, id: { in: teamIds } },
          select: { id: true },
        })
      : [],
  ]);
  const next = normalizeAccess(orgId, input.principals, {
    memberIds: new Set(members.map((m) => m.userId)),
    teamIds: new Set(teams.map((t) => t.id)),
  });
  if (next === null) {
    return 'invalid-access';
  }
  if (sameAccess(current, next)) {
    return null;
  }
  const widens = isWidening(orgId, current, next);
  if (widens && input.confirmWidening !== true) {
    return 'confirm-widening';
  }
  return { next, widens };
}

async function setAccessOnPublishedPage(
  input: SetAccessInput & { orgId: string; actorId: string },
): Promise<ReviewResult> {
  const { orgId, actorId, publicId } = input;

  type Step1 =
    | { error: ReviewError }
    | { unchanged: true }
    | {
        pageId: number;
        fileId: string;
        generation: number;
        before: string[];
        next: string[];
        widens: boolean;
      };
  const step1 = await db.$transaction(async (tx): Promise<Step1> => {
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
        accessibleBy: true,
        publishedAt: true,
        publishedFileId: true,
        publicationGeneration: true,
        updatedAt: true,
      },
    });
    if (!page || !page.publishedAt || !page.publishedFileId) {
      return { error: 'not-found' };
    }
    if (
      page.updatedAt.toISOString() !==
      new Date(input.expectedUpdatedAt).toISOString()
    ) {
      return { error: 'conflict' };
    }
    const resolved = await resolveAccess(tx, input, page.accessibleBy);
    if (resolved === null) {
      return { unchanged: true };
    }
    if (typeof resolved === 'string') {
      return { error: resolved };
    }
    // A published page open to nobody would sit in the index for no reader;
    // withdrawing it is the honest way to say that.
    if (resolved.next.length === 0) {
      return { error: 'no-access' };
    }
    const generation = page.publicationGeneration + 1;
    await tx.knowledgePage.updateMany({
      where: { organizationId: orgId, id: page.id },
      data: { publicationGeneration: generation },
    });
    return {
      pageId: page.id,
      fileId: page.publishedFileId,
      generation,
      before: page.accessibleBy,
      next: resolved.next,
      widens: resolved.widens,
    };
  });
  if ('error' in step1) {
    return { success: false, error: step1.error };
  }
  if ('unchanged' in step1) {
    return { success: true, changed: false };
  }

  try {
    await deleteFileFromVectorStore(step1.fileId, orgId);
  } catch (error) {
    logger.error(
      {
        orgId,
        pageId: publicId,
        error: error instanceof Error ? error.message : String(error),
      },
      'brain: access change could not clear the page from the index',
    );
    return { success: false, error: 'index-unavailable' };
  }

  const recorded = await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM knowledge_pages
      WHERE id = ${step1.pageId} AND organization_id = ${orgId}
      FOR UPDATE
    `;
    const now = await tx.knowledgePage.findFirst({
      where: { organizationId: orgId, id: step1.pageId },
      select: { publicationGeneration: true, publishedAt: true },
    });
    if (now?.publicationGeneration !== step1.generation || !now.publishedAt) {
      return false;
    }
    await tx.knowledgePage.updateMany({
      where: { organizationId: orgId, id: step1.pageId },
      data: { accessibleBy: step1.next },
    });
    await tx.userFile.updateMany({
      where: { organizationId: orgId, id: step1.fileId },
      data: {
        embeddingStatus: 'STARTED',
        isOrgWide: step1.next.includes(`org:${orgId}`),
      },
    });
    await tx.knowledgeDecision.create({
      data: {
        organizationId: orgId,
        pageId: step1.pageId,
        actorId,
        action: step1.widens ? 'WIDEN_ACCESS' : 'SET_ACCESS',
        publicationGeneration: null,
        before: { accessibleBy: step1.before },
        after: { accessibleBy: step1.next, republished: true },
      },
    });
    return true;
  });
  if (!recorded) {
    return { success: false, error: 'conflict' };
  }

  try {
    await jobs().start(
      'brainPublishPage',
      `brain-publish-${publicId}-${step1.generation}-${randomUUID()}`,
      { orgId, pageId: publicId, generation: step1.generation },
    );
  } catch (error) {
    logger.error(
      {
        orgId,
        pageId: publicId,
        error: error instanceof Error ? error.message : String(error),
      },
      'brain: access changed but the index write could not be queued',
    );
    return { success: false, error: 'failed-to-start' };
  }
  await startFindingsReconcile(orgId);
  return { success: true, changed: true };
}

function principalIdsOf(
  principals: ReadonlyArray<string>,
  prefix: 'user:' | 'team:',
): string[] {
  return [
    ...new Set(
      principals
        .filter((p) => p.startsWith(prefix))
        .map((p) => p.slice(prefix.length)),
    ),
  ];
}
