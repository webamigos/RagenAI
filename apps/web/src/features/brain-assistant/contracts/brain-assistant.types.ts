import { z } from 'zod';

import { dbUuid } from '@/features/brain/contracts/brain-review.types';
import type { AccessEntry } from '@/features/brain/contracts/brain.types';
import type { ExtractionError } from '@/features/brain/contracts/brain-extraction.types';
import type { ReviewError } from '@/features/brain/contracts/brain-review.types';

/**
 * The operator's assistant beside Brain (spec
 * `docs/specs/2026-09-25-brain-operator-assistant.md`): what the panel sends,
 * what the model may propose, and what the stream answers.
 */

const FINDING_TYPES = [
  'CONTRADICTION',
  'GAP',
  'STALE',
  'ORPHAN',
  'UNOWNED',
  'EXTRACTION_FAILED',
] as const;
const FINDING_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const;
const PAGE_STATUSES = ['CANDIDATE', 'APPROVED', 'STALE', 'REJECTED'] as const;

/**
 * What is on the operator's screen, built by the page rather than parsed from
 * the URL. **It is a pointer, never a permission**: every id in it is read
 * again through the same organization-scoped queries the screen used, and an
 * id that answers nothing there is simply absent from what the model sees.
 */
export const brainScreenContextSchema = z.discriminatedUnion('view', [
  z.object({
    view: z.literal('pages'),
    status: z.enum(PAGE_STATUSES).nullable().default(null),
  }),
  z.object({
    view: z.literal('inbox'),
    status: z.enum(FINDING_STATUSES).default('OPEN'),
    type: z.enum(FINDING_TYPES).optional(),
  }),
  z.object({ view: z.literal('finding'), findingId: dbUuid }),
  z.object({ view: z.literal('page'), pageId: dbUuid }),
  z.object({
    view: z.literal('graph'),
    focusPageId: dbUuid.optional(),
    selectedPageId: dbUuid.optional(),
    communityFilter: z.number().int().min(0).max(10_000).optional(),
  }),
  z.object({
    view: z.literal('documents'),
    selectedFileIds: z.array(dbUuid).max(50).default([]),
  }),
]);
export type BrainScreenContext = z.infer<typeof brainScreenContextSchema>;
export type BrainScreenView = BrainScreenContext['view'];

/** The longest question the panel sends. Chat's composer allows more; this is a side panel. */
export const MAX_QUESTION_LENGTH = 4000;

export const brainAssistantTurnSchema = z.object({
  /** Absent on a first turn; the server creates the conversation. */
  threadId: dbUuid.optional(),
  question: z.string().trim().min(1).max(MAX_QUESTION_LENGTH),
  screen: brainScreenContextSchema,
});
export type BrainAssistantTurnInput = z.infer<typeof brainAssistantTurnSchema>;

/** The most pages one batch proposal may carry (U12). */
export const MAX_BATCH_PAGES = 30;

const reason = z.string().trim().min(1).max(600);

/**
 * What the model may propose — its tool's input. Only actions a Brain button
 * already performs: Apply runs that button's server action and nothing else,
 * so a proposal for an act Brain has no command for (verifying a page,
 * resolving or dismissing a finding by hand) is not offered at all.
 */
export const brainProposalInputSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.enum(['APPROVE', 'REJECT', 'PUBLISH', 'UNPUBLISH']),
    pageIds: z.array(dbUuid).min(1).max(MAX_BATCH_PAGES),
    reason,
  }),
  z.object({
    action: z.literal('MERGE'),
    sourcePageId: dbUuid,
    targetPageId: dbUuid,
    reason,
  }),
  z.object({
    action: z.literal('SET_OWNER'),
    pageId: dbUuid,
    ownerId: z.string().min(1).max(200),
    reason,
  }),
  z.object({
    action: z.literal('SET_ACCESS'),
    pageId: dbUuid,
    /** The complete new list, as the access editor sends it. */
    principals: z.array(z.string().max(200)).max(100),
    reason,
  }),
  z.object({
    action: z.literal('RETRY_EXTRACTION'),
    findingId: dbUuid,
    reason,
  }),
]);
export type BrainProposalInput = z.infer<typeof brainProposalInputSchema>;
export type BrainProposalAction = BrainProposalInput['action'];

/** A page a proposal names, as it was when the assistant read it. */
export type ProposalPage = {
  publicId: string;
  title: string;
  /** What Apply sends as `expectedUpdatedAt`: a page changed since is refused as `conflict`. */
  updatedAt: string;
};

/**
 * A proposal as the card shows it: the model's input, checked against the
 * database and completed with what the card needs — titles, the version of
 * each page the assistant read, and a preview where one exists.
 */
export type BrainProposal = {
  id: string;
  reason: string;
  outcome: ProposalOutcome | null;
} & (
  | {
      action: 'APPROVE' | 'REJECT' | 'PUBLISH' | 'UNPUBLISH';
      pages: ProposalPage[];
      /**
       * PUBLISH only: who each page will be retrievable by once it is in the
       * index, in the order of `pages` — what publishing exposes (U8).
       */
      audience?: AccessEntry[][];
    }
  | {
      action: 'MERGE';
      source: ProposalPage;
      target: ProposalPage;
      /** The merged page's access: the narrower of the two. */
      preview: { access: AccessEntry[] };
    }
  | {
      action: 'SET_OWNER';
      page: ProposalPage;
      owner: { id: string; name: string };
    }
  | {
      action: 'SET_ACCESS';
      page: ProposalPage;
      principals: string[];
      preview: { before: AccessEntry[]; after: AccessEntry[]; widens: boolean };
    }
  | {
      action: 'RETRY_EXTRACTION';
      finding: { publicId: string; fileName: string | null };
    }
);

/**
 * What happened when the operator acted on a card. Per page for a batch, so a
 * reopened conversation shows which of them went through.
 */
export type ProposalOutcome =
  | { status: 'dismissed'; at: string }
  | {
      status: 'applied';
      at: string;
      /** One per page (or the one finding); `error` is the action's own code. */
      results: {
        label: string;
        ok: boolean;
        error?: ReviewError | ExtractionError;
      }[];
    };

/**
 * Apply or dismiss a stored proposal. The card names it by where it is kept;
 * the proposal itself is read back from the conversation, never taken from
 * the request, so what runs is what the operator was shown.
 */
export const proposalDecisionInputSchema = z.object({
  threadId: dbUuid,
  messageId: dbUuid,
  proposalId: z.string().min(1).max(64),
  /** The operator has seen, and accepted, that SET_ACCESS widens access. */
  confirmWidening: z.boolean().default(false),
});
export type ProposalDecisionInput = z.input<typeof proposalDecisionInputSchema>;

/**
 * - `not-found` — no such conversation, message or proposal for this person.
 * - `already-decided` — the card was applied or dismissed before.
 * - `confirm-widening` — SET_ACCESS widens access; the card asks, then
 *   applies again with `confirmWidening`.
 * - `read-only` — this person may not change Brain (any more).
 */
export type ProposalDecisionResult =
  | { success: true; proposal: BrainProposal }
  | {
      success: false;
      error:
        | 'invalid-input'
        | 'not-found'
        | 'already-decided'
        | 'confirm-widening'
        | 'read-only';
    };

/**
 * Why a turn was not answered. Codes, rendered by the panel in every locale.
 *
 * - `usage-limit` — the organization is over a monthly ceiling.
 * - `rate-limit` — the team's per-minute limit.
 * - `guardrail` — an input or output rule refused the turn.
 * - `model-unavailable` — the provider failed or no route serves the model.
 * - `no-tools` — the organization's model cannot call tools, and this
 *   assistant does not answer without them.
 * - `not-found` — no such conversation for this person.
 */
export type BrainAssistantError =
  | 'usage-limit'
  | 'rate-limit'
  | 'guardrail'
  | 'model-unavailable'
  | 'no-tools'
  | 'not-found'
  | 'unknown';

/** One line of the turn's stream (newline-delimited JSON). */
export type BrainAssistantEvent =
  | { type: 'start'; threadId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool'; name: string }
  | { type: 'proposal'; proposal: BrainProposal }
  /** A proposal outside the schema was dropped; the panel says so once. */
  | { type: 'proposal-dropped' }
  | { type: 'error'; code: BrainAssistantError }
  | { type: 'done'; messageId: string | null };

/** A stored assistant turn: the answer and the proposals it made. */
export type BrainAssistantStoredMessage = {
  v: 1;
  text: string;
  proposals: BrainProposal[];
  /** An output guardrail withheld the answer; nothing of it was kept. */
  refused?: boolean;
};

export type BrainAssistantMessageView = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  proposals: BrainProposal[];
  refused: boolean;
  createdAt: string;
};

export type BrainAssistantThreadSummary = {
  id: string;
  title: string;
  createdAt: string;
};
