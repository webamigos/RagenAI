import 'server-only';

import type {
  PageDecisionInput,
  ReviewResult,
} from '../../contracts/brain-review.types';
import { decideOnKnowledgePage } from './decide-on-knowledge-page';

/**
 * Reject a candidate page (spec D2). A status, not a delete: the page and its
 * sources stay, so the ledger's row has something to point at and a later
 * extraction of the same document does not quietly offer it again as new —
 * `replaceCandidatesFromFile` never replaces a page that has a decision.
 *
 * Only a `CANDIDATE`. Retiring an approved page is withdrawal and
 * supersession, which are Phase E's.
 */
export async function rejectKnowledgePageCommand(
  input: PageDecisionInput & { orgId: string; actorId: string },
): Promise<ReviewResult> {
  return decideOnKnowledgePage(input, async (page) => {
    if (page.status !== 'CANDIDATE') {
      return 'invalid-status';
    }
    return {
      action: 'REJECT',
      data: { status: 'REJECTED' },
      before: { status: page.status },
      after: { status: 'REJECTED' },
    };
  });
}
