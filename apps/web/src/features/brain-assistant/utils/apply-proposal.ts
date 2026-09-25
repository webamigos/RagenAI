import type { ExtractionStartResult } from '@/features/brain/contracts/brain-extraction.types';
import type { ReviewResult } from '@/features/brain/contracts/brain-review.types';

import type {
  BrainProposal,
  ProposalOutcome,
} from '../contracts/brain-assistant.types';

/**
 * The Brain server actions a proposal may run — exactly the ones the Brain
 * buttons call, injected so the mapping below is the whole of what Apply can
 * do and a test can see every call it makes.
 */
export type BrainReviewActions = {
  approve: (input: unknown) => Promise<ReviewResult>;
  reject: (input: unknown) => Promise<ReviewResult>;
  publish: (input: unknown) => Promise<ReviewResult>;
  unpublish: (input: unknown) => Promise<ReviewResult>;
  merge: (input: unknown) => Promise<ReviewResult>;
  setOwner: (input: unknown) => Promise<ReviewResult>;
  setAccess: (input: unknown) => Promise<ReviewResult>;
  retryExtraction: (input: unknown) => Promise<ExtractionStartResult>;
};

type Step = {
  label: string;
  run: () => Promise<ReviewResult | ExtractionStartResult>;
};

/**
 * What Apply runs for a proposal: one action per page, each with the page's
 * `updatedAt` as the assistant read it — so a page someone changed since is
 * refused by its command as `conflict`, and the card says so.
 */
export function proposalSteps(
  proposal: BrainProposal,
  actions: BrainReviewActions,
  options: { confirmWidening: boolean },
): Step[] {
  switch (proposal.action) {
    case 'APPROVE':
    case 'REJECT':
    case 'PUBLISH':
    case 'UNPUBLISH': {
      const action = {
        APPROVE: actions.approve,
        REJECT: actions.reject,
        PUBLISH: actions.publish,
        UNPUBLISH: actions.unpublish,
      }[proposal.action];
      return proposal.pages.map((page) => ({
        label: page.title,
        run: () =>
          action({
            publicId: page.publicId,
            expectedUpdatedAt: page.updatedAt,
          }),
      }));
    }
    case 'MERGE':
      return [
        {
          label: proposal.source.title,
          run: () =>
            actions.merge({
              publicId: proposal.source.publicId,
              expectedUpdatedAt: proposal.source.updatedAt,
              targetPublicId: proposal.target.publicId,
            }),
        },
      ];
    case 'SET_OWNER':
      return [
        {
          label: proposal.page.title,
          run: () =>
            actions.setOwner({
              publicId: proposal.page.publicId,
              expectedUpdatedAt: proposal.page.updatedAt,
              ownerId: proposal.owner.id,
            }),
        },
      ];
    case 'SET_ACCESS':
      return [
        {
          label: proposal.page.title,
          run: () =>
            actions.setAccess({
              publicId: proposal.page.publicId,
              expectedUpdatedAt: proposal.page.updatedAt,
              principals: proposal.principals,
              confirmWidening: options.confirmWidening,
            }),
        },
      ];
    case 'RETRY_EXTRACTION':
      return [
        {
          label: proposal.finding.fileName ?? proposal.finding.publicId,
          run: () =>
            actions.retryExtraction({
              findingPublicId: proposal.finding.publicId,
            }),
        },
      ];
  }
}

/**
 * Run a proposal's steps one after another and report each. Sequential on
 * purpose: a batch of approvals is N decisions in the ledger, and running
 * them in parallel would only race the findings reconcile each one starts.
 */
export async function runProposalSteps(
  steps: Step[],
): Promise<Extract<ProposalOutcome, { status: 'applied' }>['results']> {
  const results: Extract<ProposalOutcome, { status: 'applied' }>['results'] =
    [];
  for (const step of steps) {
    const result = await step.run();
    results.push(
      result.success
        ? { label: step.label, ok: true }
        : { label: step.label, ok: false, error: result.error },
    );
  }
  return results;
}
