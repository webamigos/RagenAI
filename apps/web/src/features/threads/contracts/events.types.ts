import { type Message, type Thread } from '@/generated/prisma/browser';
import {
  type ApiMessageDto,
  type MessageDto,
} from '@/features/messages/contracts/message.types';
import type { ChainErrorCode } from '@/libs/chains/types/errors';

export type SseInitEvent = {
  type: 'init';
};

export type SseMessageEvent = {
  type: 'message';
  payload: MessageDto;
};

export type ApiSseMessageEvent = ApiMessageDto;

export type SseMessageDelta = {
  type: 'delta';
  payload: {
    content: string;
  };
};

export type ApiSseMessageDelta = {
  content: string;
};

export type ApiSseReasoningDelta = {
  content: string;
};

export type ApiSseThreadFound = {
  id: Thread['id'];
};

export type ApiSseMessageCreated = {
  id: Message['id'];
};

/**
 * One file the model was shown this turn.
 *
 * Deliberately thin. Gaps 3, 4 and 5 of
 * `docs/specs/2026-09-09-design-system-v2-functional-gaps.md` each add a field
 * here — a real page, a relevance score, a snippet — and each is a separate
 * change with its own decision behind it. Adding an optional field later is
 * not a breaking change; shipping one now that has nothing true to put in it
 * is how `page_number` came to hold a chunk ordinal.
 */
export type ApiSseRetrievedSource = {
  fileId: string;
  /** Null on chunks ingested before file names were stored in metadata. */
  fileName: string | null;
};

/**
 * What retrieval did, sent **before the first `delta`** so the row above the
 * answer can render while the answer is still streaming. Retrieval finishes
 * before the model is called, so this costs nothing to send early.
 *
 * The event is emitted only when retrieval actually ran. Its **absence** means
 * the knowledge base was never searched — a conversation-mode turn, or a
 * thread scoped to `MODEL_ONLY`. A turn that searched and found nothing does
 * emit it, with no sources and a `chunkCount` of zero, because "found nothing"
 * is an answer about the knowledge base and "did not look" is not.
 */
export type ApiSseRetrieval = {
  sources: ApiSseRetrievedSource[];
  /** Chunks put in front of the model; not the same as `sources.length`. */
  chunkCount: number;
  durationMs: number;
};

/**
 * Which of the retrieved files the finished answer actually cited, sent after
 * generation because it is decided from the answer text.
 *
 * Carries ids only: the client already has the names from `retrieval`, and
 * sending them twice invites the two copies to disagree.
 */
export type ApiSseCitations = {
  fileIds: string[];
};

export type SseMessageError = {
  type: 'error';
  message: string;
  originalErrorMessage?: string;
  code: ChainErrorCode;
};

export type ApiSseToolCall = {
  toolCallId: string;
  toolName: string;
};

export type ApiSseToolResult = {
  toolCallId: string;
  toolName: string;
};

/**
 * Emitted when the AI SDK pauses a write tool because its `needsApproval`
 * predicate returned true — Phase 2 prompt-injection gating. The client
 * currently renders a plain inline message ("this action requires
 * confirmation"); Phase 2b will upgrade this to a modal approval card.
 */
export type ApiSseToolApprovalRequest = {
  approvalId: string;
  toolCallId: string;
  toolName: string;
  provider: string;
};

export type SseEndEvent = {
  type: 'end';
};
