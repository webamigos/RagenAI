import type { LanguageModelV4 } from '@ai-sdk/provider';
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
  /**
   * Built on demand, not handed over ready-made.
   *
   * `createModerationInstance()` throws without an OpenAI key, and moderation
   * runs only when an administrator has enabled the `content-moderation`
   * guardrail — so constructing it eagerly made every chat request fail on an
   * installation that had deliberately not configured OpenAI, for a feature it
   * was not using. A factory means the key is only required by the code path
   * that actually calls the API.
   *
   * The gate used to be `MODERATION_ENABLED=1`; it is a row now, which makes
   * the factory matter more rather than less — the rule can be switched on at
   * any moment without a deploy.
   */
  contentModerator: () => ModerationInstance;
  answerGenerator: LanguageModelV4;
}

export interface RagChainModels extends BaseChatChainModels {
  questionRephraser: LanguageModelV4;
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
  /**
   * Guardrails for this turn, and the function that evaluates them.
   *
   * Injected rather than imported, exactly as `trackAiUsage` is: the chain is
   * a plain function and the loader is a Nest service, so the assembly site
   * supplies both. A surface that passes neither runs unguarded — which is
   * what every surface did before this phase, and is why the two are optional
   * together rather than separately.
   */
  guardrails?: {
    readonly rules: import('@ragenai/guardrails').ResolvedGuardrail[];
    readonly run: (input: {
      question: string;
      chatHistory: string | undefined;
      moderateHistory: boolean;
    }) => Promise<{ question: string; chatHistory: string }>;
    /**
     * Builds the output window for this turn, or `undefined` when the
     * organization has no output rules.
     *
     * A factory rather than an instance because a window carries the turn's
     * state: one shared between turns would evaluate the second answer
     * against the tail of the first.
     */
    readonly outputStage?: () =>
      import('@ragenai/guardrails').OutputStage | undefined;
  };
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
   * user for confirmation. See apps/web's src/libs/mcp/client.ts and
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
  /**
   * An `OUTPUT` guardrail refused the answer mid-stream.
   *
   * The stream ends here: nothing after this part is emitted, and every
   * consumer treats the text it has accumulated as withheld rather than as a
   * partial answer. Persisting that prefix would store exactly the text the
   * rule exists to suppress, which is why stopping the stream and deciding
   * what is stored are one change and not two.
   *
   * Carries the rule's identity and not the matched text — the same rule as
   * `GuardrailError`, and for the same reason: this object reaches logs.
   */
  | {
      type: 'guardrail-violation';
      guardrailPublicId: string;
      guardrailName: string;
    }
  | { type: 'other'; [key: string]: unknown };

export interface BaseChatChainOutput {
  stream: (input: BaseChatChainInput) => Promise<ChainStreamResult>;
}
