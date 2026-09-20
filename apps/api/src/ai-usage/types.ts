/**
 * Mirrors the `AiUsageStep` Prisma enum (root prisma/schema.prisma). Defined
 * locally as a string-literal union rather than imported from the generated
 * client so this module has no dependency on the DB layer beyond
 * AiUsageService itself — keep in sync with the schema by hand.
 */
export type AiUsageStep =
  | 'MODERATION'
  | 'CHAT_COMPLETION'
  | 'REPHRASING'
  | 'EMBEDDINGS'
  | 'RERANKING'
  /**
   * A judge model run by an `LLM_POLICY` guardrail.
   *
   * Its own step rather than folded into `MODERATION`, so the AI-usage page
   * can answer "what did the guardrails cost" — the question an operator asks
   * precisely because policy rules are the expensive kind: one model call per
   * rule per turn.
   */
  | 'GUARDRAIL';

export type CreateAiUsageInput = {
  organizationId: string;
  projectId?: string | null;
  threadId?: string | null;
  userId?: string | null;
  step: AiUsageStep;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCost?: number;
  durationMs?: number | null;
  metadata?: Record<string, string | number | boolean | null> | null;
};

/**
 * Callback shape accepted by llm/vector-store/reranker code that wants to
 * record AI usage without depending on NestJS DI directly (they're plain,
 * framework-agnostic classes). A real caller passes
 * `aiUsageService.track.bind(aiUsageService)` (see AiUsageService).
 */
export type TrackAiUsage = (input: CreateAiUsageInput) => Promise<void>;
