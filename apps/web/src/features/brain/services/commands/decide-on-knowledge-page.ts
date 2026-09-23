import 'server-only';

import db from '@ragenai/prisma-client';

import type {
  Prisma,
  KnowledgeDecisionAction,
} from '@/generated/prisma/client';

import type {
  ReviewError,
  ReviewResult,
} from '../../contracts/brain-review.types';
import { startFindingsReconcile } from './start-findings-reconcile';

/**
 * The transaction handle of this app's client. Not `Prisma.TransactionClient`:
 * `@ragenai/prisma-client` is the extended client (the tenant-scope guard),
 * whose transaction handle is a different type.
 */
export type ReviewTx = Parameters<
  Extract<Parameters<typeof db.$transaction>[0], (...args: never[]) => unknown>
>[0];

/** The page as a decision reads it, locked for the length of the decision. */
export type PageUnderReview = {
  id: number;
  status: 'CANDIDATE' | 'APPROVED' | 'REJECTED' | 'STALE';
  ownerId: string | null;
  accessibleBy: string[];
  publishedAt: Date | null;
};

/** What a decision changes, and how the ledger names the change. */
export type Decision = {
  action: Exclude<KnowledgeDecisionAction, 'PUBLISH' | 'UNPUBLISH'>;
  data: Prisma.KnowledgePageUncheckedUpdateManyInput;
  before: Prisma.InputJsonValue;
  after: Prisma.InputJsonValue;
};

type Decide = (
  page: PageUnderReview,
  tx: ReviewTx,
) => Promise<Decision | ReviewError | null>;

/**
 * One reviewer's decision on one page (spec D2): the page changed and the
 * `KnowledgeDecision` row recording it, in one transaction — never one
 * without the other, which is what makes the ledger an account of the page
 * rather than a log beside it.
 *
 * The page row is locked first, and the `updatedAt` the reviewer saw is
 * compared under the lock: a decision taken against a page someone else has
 * approved, re-owned or narrowed since is refused as `conflict` instead of
 * being applied on top of a state the reviewer never looked at. The two
 * values compared are both Prisma's millisecond reading of the same column,
 * so the check does not depend on how precisely Postgres stored it.
 *
 * `decide` returns the change, a refusal, or null for "the page already is
 * that" — which writes nothing, because the ledger records acts, not clicks.
 * Publication actions are not decisions of this kind: they carry a
 * generation and a Qdrant step outside the transaction, and are Phase E's.
 *
 * A decision that changed something then asks the worker to re-run the
 * computed findings (D2b) — after the commit, so the job reads what was
 * decided.
 */
export async function decideOnKnowledgePage(
  input: {
    orgId: string;
    actorId: string;
    publicId: string;
    expectedUpdatedAt: string;
  },
  decide: Decide,
): Promise<ReviewResult> {
  const { orgId, actorId, publicId, expectedUpdatedAt } = input;
  const result = await db.$transaction(async (tx): Promise<ReviewResult> => {
    const locked = await tx.$queryRaw<{ id: number }[]>`
      SELECT id FROM knowledge_pages
      WHERE public_id = ${publicId}::uuid AND organization_id = ${orgId}
      FOR UPDATE
    `;
    const id = locked[0]?.id;
    if (id === undefined) {
      return refuse('not-found');
    }
    const page = await tx.knowledgePage.findFirst({
      where: { organizationId: orgId, id },
      select: {
        id: true,
        status: true,
        ownerId: true,
        accessibleBy: true,
        publishedAt: true,
        updatedAt: true,
      },
    });
    if (!page) {
      return refuse('not-found');
    }
    if (
      page.updatedAt.toISOString() !== new Date(expectedUpdatedAt).toISOString()
    ) {
      return refuse('conflict');
    }

    const outcome = await decide(page, tx);
    if (outcome === null) {
      return { success: true, changed: false };
    }
    if (typeof outcome === 'string') {
      return refuse(outcome);
    }

    await tx.knowledgePage.updateMany({
      where: { organizationId: orgId, id: page.id },
      data: outcome.data,
    });
    await tx.knowledgeDecision.create({
      data: {
        organizationId: orgId,
        pageId: page.id,
        actorId,
        action: outcome.action,
        // Null for every action but PUBLISH and UNPUBLISH — the migration's
        // CHECK, and what lets a page be approved twice in its life.
        publicationGeneration: null,
        before: outcome.before,
        after: outcome.after,
      },
    });
    return { success: true, changed: true };
  });
  if (result.success && result.changed) {
    await startFindingsReconcile(orgId);
  }
  return result;
}

/** Whether `userId` is a member of the organization now. */
export async function isOrgMember(
  tx: ReviewTx,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const member = await tx.member.findFirst({
    where: { organizationId: orgId, userId },
    select: { id: true },
  });
  return member !== null;
}

function refuse(error: ReviewError): ReviewResult {
  return { success: false, error };
}
