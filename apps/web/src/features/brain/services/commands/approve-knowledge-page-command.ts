import 'server-only';

import type {
  PageDecisionInput,
  ReviewResult,
} from '../../contracts/brain-review.types';
import { decideOnKnowledgePage, isOrgMember } from './decide-on-knowledge-page';

/**
 * Approve a candidate page (spec D2): a person says the page says what its
 * sources say.
 *
 * **Only with an owner, and one who is still a member.** The owner is the
 * person who vouches for the page (spec, `KnowledgePage.ownerId`), and an
 * unowned page is neither exported nor published — so approving one would
 * create a curated page that nothing downstream may use, and an `UNOWNED`
 * finding the moment reconciliation runs. The reviewer sets the owner first;
 * it is one more decision in the ledger, not a field approval fills in.
 *
 * Only a `CANDIDATE`. Re-approving a `STALE` page means re-pinning its
 * sources to the versions the reviewer now read, which is its own act and
 * not built yet.
 */
export async function approveKnowledgePageCommand(
  input: PageDecisionInput & { orgId: string; actorId: string },
): Promise<ReviewResult> {
  return decideOnKnowledgePage(input, async (page, tx) => {
    if (page.status !== 'CANDIDATE') {
      return 'invalid-status';
    }
    if (page.ownerId === null) {
      return 'owner-required';
    }
    if (!(await isOrgMember(tx, input.orgId, page.ownerId))) {
      return 'owner-not-member';
    }
    return {
      action: 'APPROVE',
      data: { status: 'APPROVED' },
      before: { status: page.status },
      after: { status: 'APPROVED' },
    };
  });
}
