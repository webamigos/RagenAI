import type { LanguageModelV3 } from '@ai-sdk/provider';
import type { ModerationInstance } from '@/app/lib/services/llm';
import type { EmbeddingsProvider } from '@/libs/llm/types/embeddings';

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
  ragSettings?: ChainRagSettings;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mcpTools?: Record<string, any>;
  mcpContext?: string;
  tracking?: ChainTrackingContext;
  threadDocuments?: import('@/features/documents/contracts/document.types').ThreadDocumentUI[];
  /**
   * Tool call IDs the user has already explicitly approved for this turn.
   * Populated in Phase 2b (modal approval re-entry). Phase 2a always
   * passes an empty array — a paused tool stays paused until the user
   * sends a new message expressing explicit intent.
   */
  approvedToolCalls?: readonly string[];
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
   * user for confirmation. See `src/libs/mcp/client.ts` and
   * `src/libs/security/tool-gating-context.ts`.
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
