import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ModerationInstance } from '../moderation-instance.js';
import type { EmbeddingsProvider } from '../../llm/types/embeddings.js';
import type { TrackAiUsage } from '../../ai-usage/types.js';
import type { ThreadDocumentUI } from './thread-document.js';

/** Maximum number of tool-use steps allowed per stream when MCP tools are enabled. */
export const MAX_TOOL_STEPS = 10;

export interface BaseChatChainInput {
  question: string;
  chat_history: string | undefined;
}

export interface BaseChatChainModels {
  contentModerator: ModerationInstance;
  answerGenerator: LanguageModelV3;
}

export interface RagChainModels extends BaseChatChainModels {
  questionRephraser: LanguageModelV3;
  embeddings: EmbeddingsProvider;
}

export interface ChainTrackingContext {
  organizationId: string;
  projectId?: string | null;
  userId?: string | null;
}

export interface ChainRagSettings {
  multiQueryEnabled: boolean;
  contentModerationEnabled: boolean;
  rerankingEnabled: boolean;
}

export interface ChainConfig {
  answerInstructions?: string | null;
  projectInstruction?: string;
  /**
   * Cap on generated tokens. Threaded through to `streamText({ maxTokens })`.
   * Leave undefined for provider default. Populated by the OpenAI-compatible
   * API (`/api/v1/chat/completions`) from the caller's `max_tokens`.
   */
  maxTokens?: number;
  ragSettings?: ChainRagSettings;

  mcpTools?: Record<string, any>;
  mcpContext?: string;
  tracking?: ChainTrackingContext;
  threadDocuments?: ThreadDocumentUI[];
  /**
   * Tool call IDs the user has already explicitly approved for this turn.
   * Populated in Phase 2b (modal approval re-entry). Phase 2a always
   * passes an empty array — a paused tool stays paused until the user
   * sends a new message expressing explicit intent.
   */
  approvedToolCalls?: readonly string[];
  /**
   * Optional injected callback for recording AI usage (rephrase/expand and
   * moderation calls made inside the chain) instead of a global import —
   * keeps this module framework-agnostic (no NestJS DI inside it). See
   * ai-usage/types.ts and docs/adrs/21-monorepo-and-api-decoupling.md.
   */
  trackAiUsage?: TrackAiUsage;
}

export interface RagChainConfig extends ChainConfig {
  maxDocumentsToRetrieve?: number;
  metadataFilter?: object;
  /** Org's virtual LiteLLM key — used to attribute rerank usage to the org. */
  litellmApiKey?: string;
}

export interface ChainUsage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  totalTokens: number | undefined;
}

export interface ChainStreamResult {
  textStream: AsyncIterable<string>;
  text: PromiseLike<string>;
  fullStream: AsyncIterable<ChainStreamPart>;
  reasoningText: PromiseLike<string | undefined>;
  usage: PromiseLike<ChainUsage>;
  sourceFileIds: PromiseLike<string[]>;
}

export type ChainStreamPart =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'reasoning-start'; id: string }
  | { type: 'reasoning-delta'; id: string; delta: string }
  | { type: 'reasoning-end'; id: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | {
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      result: unknown;
    }
  /**
   * Emitted by the SDK when a tool's `needsApproval` predicate returns
   * true. Phase 2 prompt-injection gating: the tool is NOT executed —
   * the SDK pauses and surfaces this part so the stream can prompt the
   * user for confirmation. See ragen-app's src/libs/mcp/client.ts and
   * src/libs/security/tool-gating-context.ts (not ported here — the MCP
   * tool loading layer is out of scope for this slice).
   */
  | {
      type: 'tool-approval-request';
      approvalId: string;
      toolCallId: string;
      toolName: string;
      args: unknown;
    }
  | { type: 'other'; [key: string]: unknown };

export interface BaseChatChainOutput {
  stream: (input: BaseChatChainInput) => Promise<ChainStreamResult>;
}
