'use server';

import { z } from 'zod';

import { getCurrentUserId } from '@/app/lib/utils/auth-helpers';
import { dbUuid } from '@/features/brain/contracts/brain-review.types';
import { getBrainAccessQuery } from '@/features/brain/services/queries/get-brain-access-query';
import {
  proposalDecisionInputSchema,
  type BrainAssistantMessageView,
  type BrainAssistantThreadSummary,
  type ProposalDecisionResult,
} from '@/features/brain-assistant/contracts/brain-assistant.types';
import {
  readStoredProposalQuery,
  recordProposalOutcomeCommand,
} from '@/features/brain-assistant/services/commands/brain-assistant-thread-commands';
import {
  getBrainAssistantThreadQuery,
  getBrainAssistantThreadsQuery,
} from '@/features/brain-assistant/services/queries/get-brain-assistant-threads-query';
import {
  proposalSteps,
  runProposalSteps,
  type BrainReviewActions,
} from '@/features/brain-assistant/utils/apply-proposal';

import {
  approveKnowledgePageAction,
  mergeKnowledgePagesAction,
  publishKnowledgePageAction,
  rejectKnowledgePageAction,
  retryExtractionFindingAction,
  setKnowledgePageAccessAction,
  setKnowledgePageOwnerAction,
  unpublishKnowledgePageAction,
} from './actions';

/**
 * The assistant panel's actions (spec B1, C1). Each asks Brain access and the
 * `brainAssistant` key first, and takes the organization and the person from
 * the session: a conversation is found only as this person's, here.
 *
 * **Apply runs Brain's own actions**, the ones the buttons call — imported
 * below and nothing else — so every check a button has (write access,
 * `manageBrain`, the widening rule, `updatedAt`) applies unchanged, and the
 * ledger names the person who pressed Apply.
 */

const REVIEW_ACTIONS: BrainReviewActions = {
  approve: approveKnowledgePageAction,
  reject: rejectKnowledgePageAction,
  publish: publishKnowledgePageAction,
  unpublish: unpublishKnowledgePageAction,
  merge: mergeKnowledgePagesAction,
  setOwner: setKnowledgePageOwnerAction,
  setAccess: setKnowledgePageAccessAction,
  retryExtraction: retryExtractionFindingAction,
};

async function assistantOwner(): Promise<{
  orgId: string;
  userId: string;
  canWrite: boolean;
} | null> {
  const access = await getBrainAccessQuery();
  if (!access?.assistant) {
    return null;
  }
  const userId = await getCurrentUserId();
  return userId
    ? { orgId: access.orgId, userId, canWrite: access.canWrite }
    : null;
}

export async function listBrainAssistantThreadsAction(): Promise<
  BrainAssistantThreadSummary[]
> {
  const owner = await assistantOwner();
  return owner ? getBrainAssistantThreadsQuery(owner) : [];
}

export async function getBrainAssistantThreadAction(
  threadId: unknown,
): Promise<{ id: string; messages: BrainAssistantMessageView[] } | null> {
  const parsed = z.object({ threadId: dbUuid }).safeParse({ threadId });
  const owner = await assistantOwner();
  if (!parsed.success || !owner) {
    return null;
  }
  const thread = await getBrainAssistantThreadQuery(
    owner,
    parsed.data.threadId,
  );
  if (!thread || owner.canWrite) {
    return thread;
  }
  // A read-only visitor is shown no proposal, including one kept from a time
  // they could write (spec, "Out of scope").
  return {
    ...thread,
    messages: thread.messages.map((m) => ({ ...m, proposals: [] })),
  };
}

export async function applyBrainProposalAction(
  input: unknown,
): Promise<ProposalDecisionResult> {
  const parsed = proposalDecisionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'invalid-input' };
  }
  const owner = await assistantOwner();
  if (!owner) {
    return { success: false, error: 'not-found' };
  }
  if (!owner.canWrite) {
    return { success: false, error: 'read-only' };
  }
  const { threadId, messageId, proposalId, confirmWidening } = parsed.data;
  const proposal = await readStoredProposalQuery(
    owner,
    threadId,
    messageId,
    proposalId,
  );
  if (!proposal) {
    return { success: false, error: 'not-found' };
  }
  if (proposal.outcome !== null) {
    return { success: false, error: 'already-decided' };
  }

  const results = await runProposalSteps(
    proposalSteps(proposal, REVIEW_ACTIONS, { confirmWidening }),
  );
  // Widening is asked about on the card, as the access editor asks — and
  // nothing is recorded until the operator answers.
  if (
    proposal.action === 'SET_ACCESS' &&
    results[0]?.error === 'confirm-widening'
  ) {
    return { success: false, error: 'confirm-widening' };
  }

  const recorded = await recordProposalOutcomeCommand(
    owner,
    threadId,
    messageId,
    proposalId,
    { status: 'applied', at: new Date().toISOString(), results },
  );
  return typeof recorded === 'string'
    ? { success: false, error: recorded }
    : { success: true, proposal: recorded };
}

export async function dismissBrainProposalAction(
  input: unknown,
): Promise<ProposalDecisionResult> {
  const parsed = proposalDecisionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'invalid-input' };
  }
  const owner = await assistantOwner();
  if (!owner) {
    return { success: false, error: 'not-found' };
  }
  const recorded = await recordProposalOutcomeCommand(
    owner,
    parsed.data.threadId,
    parsed.data.messageId,
    parsed.data.proposalId,
    { status: 'dismissed', at: new Date().toISOString() },
  );
  return typeof recorded === 'string'
    ? { success: false, error: recorded }
    : { success: true, proposal: recorded };
}
