import 'server-only';
import type {
  PageDecisionInput,
  ReviewResult,
} from '../../contracts/brain-review.types';
import { approveKnowledgePageCommand } from './approve-knowledge-page-command';
import { publishKnowledgePageCommand } from './publish-knowledge-page-command';
/** Publication is a second act. Its failure leaves approval recorded and visible. */
export async function approveAndPublishKnowledgePageCommand(
  input: PageDecisionInput & { orgId: string; actorId: string },
): Promise<ReviewResult> {
  const approved = await approveKnowledgePageCommand({
    ...input,
    returnUpdatedAt: true,
  });
  if (!approved.success) {
    return approved;
  }
  if (!approved.updatedAt) {
    return { success: false, error: 'conflict' };
  }
  const publication = await publishKnowledgePageCommand({
    ...input,
    expectedUpdatedAt: approved.updatedAt,
  });
  return publication.success ? publication : { ...publication, approved: true };
}
