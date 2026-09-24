import type { GenerateStructured } from '@ragenai/brain-core';
import { generateObject, NoObjectGeneratedError, zodSchema } from 'ai';

/** Output cap per call — also what bounds a run's overshoot of its budget. */
export const MAX_OUTPUT_TOKENS = 16_000;

/**
 * Thinking tokens a Gemini model may spend before it answers.
 *
 * They count against `MAX_OUTPUT_TOKENS`. Left unbounded, gemini-2.5-flash
 * spent most of an 8,000-token cap thinking and ran out part-way through the
 * JSON; the SDK then had no object to return, and 12 of 26 eval extractions
 * failed with `(root): invalid_type` at ~10k tokens an attempt. Extraction is
 * copying and sorting, not reasoning, so the budget is small.
 */
export const THINKING_BUDGET_TOKENS = 2_048;

/**
 * Provider options for the models extraction runs on. Vertex reads `vertex`
 * (or `googleVertex`), the Gemini API reads `google`, and every other
 * provider ignores a namespace it does not own — so one object serves the
 * route table whichever provider it names.
 */
/**
 * The SDK's own retries for a failed call, with its exponential backoff
 * (2 s, 4 s, 8 s, 16 s). Two, the default, give up about six seconds after a
 * 429 — long enough to fail and too short for a rate limit to lift, and a
 * document that fails both attempts becomes an EXTRACTION_FAILED finding
 * somebody has to retry by hand. The run's concurrency ceiling is the first
 * defence (`BRAIN_EXTRACT_CONCURRENCY`); this is the second.
 */
export const MAX_RETRIES = 4;

const PROVIDER_OPTIONS = {
  google: { thinkingConfig: { thinkingBudget: THINKING_BUDGET_TOKENS } },
  vertex: { thinkingConfig: { thinkingBudget: THINKING_BUDGET_TOKENS } },
};

/**
 * `brain-core`'s injected model call, bound to the AI SDK.
 *
 * One binding for the job and for everything that measures it — the preview
 * script and the extraction eval — so a number taken from either describes
 * the call the job makes.
 */
export function structuredGenerator(
  model: Parameters<typeof generateObject>[0]['model'],
): GenerateStructured {
  return async ({ system, prompt, schema }) => {
    try {
      const result = await generateObject({
        model,
        schema: zodSchema(schema),
        system,
        prompt,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxRetries: MAX_RETRIES,
        providerOptions: PROVIDER_OPTIONS,
        experimental_telemetry: { isEnabled: true },
      });
      return {
        object: result.object,
        usage: {
          inputTokens: result.usage?.inputTokens ?? 0,
          outputTokens: result.usage?.outputTokens ?? 0,
        },
      };
    } catch (error) {
      // The SDK refused an answer that did not match the schema. Returned
      // rather than thrown so the tokens it cost are charged to the budget,
      // and so the retry is told which fields were wrong; the answer itself
      // is dropped, since it is the model's rendering of the document.
      if (NoObjectGeneratedError.isInstance(error)) {
        return {
          object: null,
          usage: {
            inputTokens: error.usage?.inputTokens ?? 0,
            outputTokens: error.usage?.outputTokens ?? 0,
          },
        };
      }
      throw error;
    }
  };
}
