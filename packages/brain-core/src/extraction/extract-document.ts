import type { z } from 'zod';

import type { ExtractionBudget, TokenUsage } from './budget';
import {
  EXTRACTION_SYSTEM_PROMPT,
  extractionUserPrompt,
  retryUserPrompt,
} from './prompt';
import {
  extractionProviderSchema,
  parseExtraction,
  type ExtractionResult,
} from './schema';
import { splitIntoWindows } from './windows';

/**
 * The model call, injected. apps/worker binds it to the gateway's structured
 * output; tests bind it to fixtures. It receives the schema so an adapter can
 * hand it to the provider, and its answer is parsed again here regardless —
 * the retry-with-the-error rule below needs one place that decides what a
 * valid answer is.
 *
 * It may throw. What it throws is reduced by `describeFailure` before it is
 * kept anywhere.
 */
export type GenerateStructured = (request: {
  system: string;
  prompt: string;
  schema: typeof extractionProviderSchema;
}) => Promise<{ object: unknown; usage: TokenUsage }>;

export type ExtractDocumentInput = {
  fileName: string;
  text: string;
  generate: GenerateStructured;
  budget: ExtractionBudget;
  /** Characters per model call. */
  maxWindowChars?: number;
};

export type ExtractDocumentOutcome =
  | {
      status: 'extracted';
      /** One result per window, in order — merging is `assembleCandidates`'s. */
      windows: ExtractionResult[];
      /** Items dropped for failing their limits or the per-window caps. */
      rejectedItems: number;
      usage: TokenUsage;
    }
  | {
      /** One automatic retry, then this: the caller raises EXTRACTION_FAILED. */
      status: 'failed';
      windowIndex: number;
      reason: string;
      usage: TokenUsage;
    }
  | {
      /**
       * The run's ceiling was reached part-way. Nothing is returned for the
       * document: a page assembled from some windows of it would be a
       * confident summary of half a policy.
       */
      status: 'budget_exhausted';
      usage: TokenUsage;
    };

export const DEFAULT_MAX_WINDOW_CHARS = 12_000;

/** Attempts per window: the first, and one retry with the problem fed back. */
const ATTEMPTS = 2;

export async function extractDocument(
  input: ExtractDocumentInput,
): Promise<ExtractDocumentOutcome> {
  const windows = splitIntoWindows(
    input.text,
    input.maxWindowChars ?? DEFAULT_MAX_WINDOW_CHARS,
  );
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  const results: ExtractionResult[] = [];
  let rejectedItems = 0;
  // Admission lives here rather than with the caller so a handler cannot
  // forget it: every document that reaches a model call has been counted.
  if (!input.budget.admitDocument()) {
    return { status: 'budget_exhausted', usage };
  }

  for (const [windowIndex, window] of windows.entries()) {
    const prompt = extractionUserPrompt({
      fileName: input.fileName,
      window,
      windowIndex,
      windowCount: windows.length,
    });

    let problem: string | null = null;
    let result: ExtractionResult | null = null;
    for (let attempt = 0; attempt < ATTEMPTS && result === null; attempt++) {
      if (!input.budget.allowsCall()) {
        return { status: 'budget_exhausted', usage };
      }
      try {
        const answer = await input.generate({
          system: EXTRACTION_SYSTEM_PROMPT,
          prompt: problem === null ? prompt : retryUserPrompt(prompt, problem),
          schema: extractionProviderSchema,
        });
        usage.inputTokens += answer.usage.inputTokens;
        usage.outputTokens += answer.usage.outputTokens;
        input.budget.charge(answer.usage);

        const parsed = parseExtraction(answer.object);
        if (parsed.ok) {
          result = parsed.result;
          rejectedItems += parsed.rejectedItems;
        } else {
          problem = describeIssues(parsed.error);
        }
      } catch (error) {
        problem = describeFailure(error);
      }
    }

    if (result === null) {
      return {
        status: 'failed',
        windowIndex,
        reason: problem ?? 'no answer',
        usage,
      };
    }
    results.push(result);
  }

  return { status: 'extracted', windows: results, rejectedItems, usage };
}

/**
 * Schema issues as paths and codes — never the rejected values.
 *
 * This string is fed back to the model and stored in an EXTRACTION_FAILED
 * finding's `detail`, which people read. A rejected value is a fragment of the
 * customer's document; a path is not.
 */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 10)
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `${path}: ${issue.code}`;
    })
    .join('; ');
}

/**
 * A thrown error reduced to its class name.
 *
 * Deliberately not `error.message`, and never the error object itself: the
 * AI SDK's errors carry `requestBodyValues`, and a provider's message can
 * quote the request — both contain the document. Logging `{ err }` from a
 * provider call is how a customer's message reached the logs at four
 * guardrail call sites; this is the same rule at a new one.
 * A schema mismatch the SDK detected arrives as its own named error, which
 * is enough for the model to try again.
 */
export function describeFailure(error: unknown): string {
  if (error instanceof Error && error.name) {
    return `the call failed (${error.name})`;
  }
  return 'the call failed';
}
