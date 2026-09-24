import 'server-only';

import { isWidening } from '@ragenai/brain-core';

import type {
  ReviewResult,
  SetAccessInput,
} from '../../contracts/brain-review.types';
import { normalizeAccess, sameAccess } from '../../utils/normalize-access';
import { decideOnKnowledgePage } from './decide-on-knowledge-page';

/**
 * Change who a page is open to (spec D2, "The permission rule, stated once").
 *
 * **The server decides whether a change widens, never the client.** A change
 * that lets anyone read the page who could not before is `WIDEN_ACCESS` —
 * even if it also removes others — and is refused as `confirm-widening`
 * unless the reviewer confirmed it; anything else is `SET_ACCESS`. The
 * classification is `isWidening` from `@ragenai/brain-core`, the same
 * package that computed the narrow default at extraction, so "narrower" means
 * one thing on both sides.
 *
 * **Not on a published page.** Its principals are on its chunks, and a
 * change that rewrote only the row would be a revocation the ledger records
 * and retrieval ignores. Reaching the chunks is E4's; until it exists, the
 * change is refused as `published`. Nothing is published before Phase E, so
 * today this is a guard against the order the phases land in.
 */
export async function setKnowledgePageAccessCommand(
  input: SetAccessInput & { orgId: string; actorId: string },
): Promise<ReviewResult> {
  const { orgId } = input;
  return decideOnKnowledgePage(input, async (page, tx) => {
    if (page.status === 'REJECTED') {
      return 'invalid-status';
    }
    if (page.publishedAt !== null) {
      return 'published';
    }

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
    if (sameAccess(page.accessibleBy, next)) {
      return null;
    }

    const widens = isWidening(orgId, page.accessibleBy, next);
    if (widens && input.confirmWidening !== true) {
      return 'confirm-widening';
    }
    return {
      action: widens ? 'WIDEN_ACCESS' : 'SET_ACCESS',
      data: { accessibleBy: next },
      before: { accessibleBy: page.accessibleBy },
      after: { accessibleBy: next },
    };
  });
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
