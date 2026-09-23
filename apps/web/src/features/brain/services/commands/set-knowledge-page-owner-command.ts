import 'server-only';

import type {
  ReviewResult,
  SetOwnerInput,
} from '../../contracts/brain-review.types';
import { decideOnKnowledgePage, isOrgMember } from './decide-on-knowledge-page';

/**
 * Name the person who vouches for a page (spec D2) — not whoever uploaded a
 * source. Any member of the organization may be named, whatever their role:
 * the owner answers for the content, and the person who knows the process is
 * rarely an administrator.
 *
 * Not on a rejected page, which nobody curates. Naming the current owner
 * again writes nothing.
 */
export async function setKnowledgePageOwnerCommand(
  input: SetOwnerInput & { orgId: string; actorId: string },
): Promise<ReviewResult> {
  return decideOnKnowledgePage(input, async (page, tx) => {
    if (page.status === 'REJECTED') {
      return 'invalid-status';
    }
    if (!(await isOrgMember(tx, input.orgId, input.ownerId))) {
      return 'owner-not-member';
    }
    if (page.ownerId === input.ownerId) {
      return null;
    }
    return {
      action: 'SET_OWNER',
      data: { ownerId: input.ownerId },
      before: { ownerId: page.ownerId },
      after: { ownerId: input.ownerId },
    };
  });
}
