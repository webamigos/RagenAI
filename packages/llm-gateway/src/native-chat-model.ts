import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from '@ai-sdk/provider';

import {
  multimodalPolicyFromEnv,
  selectModelForContent,
  type MultimodalPolicy,
} from './multimodal';
import {
  reasoningEffortOptions,
  type ReasoningEffortLevel,
} from './reasoning-effort';
import type { LlmGateway } from './resolve-model';
import type { CredentialScope } from './types';

export type NativeChatModelRequest = {
  /** The model id the application asked for, before any multimodal swap. */
  readonly modelId: string;
  readonly reasoningEffort?: ReasoningEffortLevel;
  /**
   * Applied when the caller does not set one per call. The proxy path bakes
   * temperature into the model at construction, so without this the two paths
   * disagree on every turn: `native` silently used each provider's default.
   */
  readonly temperature?: number;
  /**
   * Which models accept a reasoning effort. Injected because that is a fact
   * about the catalogue (`MODEL_REGISTRY`), which this package does not read.
   */
  readonly supportsReasoningEffort: (modelId: string) => boolean;
  /** Defaults to the environment's policy. */
  readonly multimodal?: MultimodalPolicy;
  readonly scope?: CredentialScope;
};

/**
 * A `LanguageModelV4` that picks its upstream on the first call rather than at
 * construction.
 *
 * Two things force this, and both are consequences of the proxy going away.
 *
 * **The multimodal swap needs the messages.** It used to run inside a `fetch`
 * hook, after the request had been serialised, where the images were plainly
 * visible. B1 correctly re-described it as model *selection* — but the
 * application's seam (`createChatCompletionInstance`) builds a model from
 * options alone and never sees a message. Resolving lazily is what lets the
 * decision happen where the content is, without threading the whole prompt back
 * through every call site.
 *
 * **Resolution is async and the seam is not.** Credentials come from a
 * `CredentialSource` that will be the token vault before long, so it cannot
 * become synchronous. `doGenerate`/`doStream` are already async, so deferring
 * costs nothing and keeps all ~7 call sites unchanged.
 *
 * The resolved model is cached per selected id: a chain reuses one instance
 * across turns, and re-resolving would rebuild a provider client per call.
 */
class NativeChatModel implements LanguageModelV4 {
  readonly specificationVersion = 'v4' as const;
  readonly provider = 'ragen-llm-gateway';

  private readonly gateway: LlmGateway;
  private readonly request: NativeChatModelRequest;
  private readonly policy: MultimodalPolicy;
  private readonly resolved = new Map<string, Promise<LanguageModelV4>>();

  constructor(gateway: LlmGateway, request: NativeChatModelRequest) {
    this.gateway = gateway;
    this.request = request;
    this.policy = request.multimodal ?? multimodalPolicyFromEnv();
  }

  /** The id asked for. The id actually called may differ, per turn. */
  get modelId(): string {
    return this.request.modelId;
  }

  /**
   * Answered for the requested model, before any swap.
   *
   * The AI SDK reads this to decide which URLs to download rather than pass
   * through, and it reads it once, outside a call — so there is no prompt to
   * select on yet. The requested model is the honest answer: a swap only ever
   * happens *towards* the vision-capable fallback, so treating a URL as
   * unsupported here is the conservative direction (it gets downloaded and
   * inlined, which both models accept).
   */
  get supportedUrls(): PromiseLike<Record<string, RegExp[]>> {
    return this.resolveFor(this.request.modelId).then(
      (model) => model.supportedUrls,
    );
  }

  async doGenerate(options: LanguageModelV4CallOptions) {
    const { model, callOptions } = await this.prepare(options);
    return model.doGenerate(callOptions);
  }

  async doStream(options: LanguageModelV4CallOptions) {
    const { model, callOptions } = await this.prepare(options);
    return model.doStream(callOptions);
  }

  private async prepare(options: LanguageModelV4CallOptions) {
    const modelId = selectModelForContent(
      this.request.modelId,
      options.prompt,
      this.policy,
    );

    const route = this.gateway.routeFor(modelId);
    const model = await this.resolveFor(modelId);

    const reasoning = route
      ? reasoningEffortOptions(
          route.provider,
          modelId,
          this.request.reasoningEffort,
          this.request.supportsReasoningEffort,
        )
      : undefined;

    // A per-call temperature is an explicit request and wins; this only fills
    // in the one the seam was constructed with.
    const callOptions =
      this.request.temperature !== undefined &&
      options.temperature === undefined
        ? { ...options, temperature: this.request.temperature }
        : options;

    if (!reasoning) {
      return { model, callOptions };
    }

    return {
      model,
      callOptions: {
        ...callOptions,
        providerOptions: mergeProviderOptions(
          reasoning,
          callOptions.providerOptions,
        ),
      },
    };
  }

  private resolveFor(modelId: string): Promise<LanguageModelV4> {
    const cached = this.resolved.get(modelId);
    if (cached) {
      return cached;
    }
    // A rejection is evicted rather than cached. Missing credentials and a
    // vault that was briefly unreachable look identical here, and caching the
    // failure would turn the second into a permanent one for the life of the
    // chain.
    const pending = this.gateway
      .resolveModel(modelId, { scope: this.request.scope })
      .catch((error: unknown) => {
        this.resolved.delete(modelId);
        throw error;
      });
    this.resolved.set(modelId, pending);
    return pending;
  }
}

/**
 * A chat model served by the gateway rather than by the proxy.
 *
 * Returns synchronously so it can sit behind the application's existing
 * factories unchanged — see `NativeChatModel` for why resolution is deferred.
 */
export function nativeChatModel(
  gateway: LlmGateway,
  request: NativeChatModelRequest,
): LanguageModelV4 {
  return new NativeChatModel(gateway, request);
}

/**
 * The caller's own provider options win — this is a default the application
 * applies, not an override of an explicit request — but they win **per field**,
 * not per provider namespace.
 *
 * A shallow spread looked equivalent and was not: `reasoning` is
 * `{ openai: { reasoningEffort } }`, so a caller passing any other `openai`
 * option replaced that whole object and dropped the configured effort. The
 * namespace is exactly how callers pass provider options, so the shallow
 * version failed in the common case rather than an exotic one.
 */
type ProviderOptions = NonNullable<
  LanguageModelV4CallOptions['providerOptions']
>;

function mergeProviderOptions(
  defaults: ProviderOptions,
  callers: LanguageModelV4CallOptions['providerOptions'],
): ProviderOptions {
  const merged: ProviderOptions = { ...defaults, ...callers };
  for (const [namespace, values] of Object.entries(defaults)) {
    const callerValues = callers?.[namespace];
    if (callerValues) {
      merged[namespace] = { ...values, ...callerValues };
    }
  }
  return merged;
}
