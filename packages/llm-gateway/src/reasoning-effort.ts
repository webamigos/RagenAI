import type { ProviderId } from './types';

export type ReasoningEffortLevel = 'low' | 'medium' | 'high';

/**
 * Reasoning effort for models that accept it.
 *
 * Ported from `chat-completion-factory.ts`, where it was written directly into
 * the outgoing JSON body — `body.reasoning_effort`, plus renaming `max_tokens`
 * to `max_completion_tokens`, because reasoning models reject the legacy field.
 * Both were wire-format surgery that only worked against an OpenAI-compatible
 * endpoint, and both relied on LiteLLM's `drop_params: true` to strip the field
 * again for models that do not understand it.
 *
 * Neither crutch exists here. AI SDK 7 carries this as `providerOptions`, a
 * first-class per-call option the provider serialises itself — including the
 * `max_completion_tokens` rename, which is the provider's business and no
 * longer ours. And with `drop_params` gone, sending the field to a provider
 * that does not want it is an upstream error rather than a silent no-op, so
 * *not* sending it is now load-bearing rather than merely tidy.
 */
const SUPPORTED_PROVIDERS: ReadonlySet<ProviderId> = new Set([
  'azure',
  'openai-compatible',
]);

export type ReasoningEffortOptions = Record<
  string,
  Record<string, ReasoningEffortLevel>
>;

/**
 * The `providerOptions` fragment for this call, or `undefined` when there is
 * nothing to add.
 *
 * `supportsEffort` is injected rather than read from a model list here: which
 * models reason is a property of the catalogue (`MODEL_REGISTRY`), and this
 * package deliberately does not depend on presentation — see B1 in the spec.
 */
export function reasoningEffortOptions(
  provider: ProviderId,
  modelId: string,
  effort: ReasoningEffortLevel | undefined,
  supportsEffort: (modelId: string) => boolean,
): ReasoningEffortOptions | undefined {
  if (!effort) {
    return undefined;
  }
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    return undefined;
  }
  if (!supportsEffort(modelId)) {
    return undefined;
  }
  // Both providers speak the OpenAI dialect, so the option lives under
  // `openai` for either — Azure's provider reads the same namespace.
  return { openai: { reasoningEffort: effort } };
}
