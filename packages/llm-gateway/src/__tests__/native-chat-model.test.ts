import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from '@ai-sdk/provider';
import { describe, expect, it, vi } from 'vitest';

import { nativeChatModel } from '../native-chat-model';
import { LlmGateway } from '../resolve-model';
import { loadRouteTable } from '../route-table';
import type { CredentialSource, ProviderFactory } from '../types';

const routes = loadRouteTable({
  version: 1,
  routes: {
    'gpt-oss-120b': {
      provider: 'openai-compatible',
      connection: 'scaleway',
      model: 'gpt-oss-120b',
    },
    'mistral-small-3.2': {
      provider: 'openai-compatible',
      connection: 'scaleway',
      model: 'mistral-small-3.2-24b-instruct-2506',
    },
    'claude-sonnet-5': {
      provider: 'bedrock',
      model: 'eu.anthropic.claude-sonnet-5',
    },
  },
});

const credentials: CredentialSource = {
  forProvider: vi.fn(async () => ({ apiKey: 'k', baseUrl: 'https://u' })),
};

/** An upstream model that records the call options it was handed. */
function upstream(id: string) {
  return {
    specificationVersion: 'v4',
    provider: 'test',
    modelId: id,
    supportedUrls: {},
    doGenerate: vi.fn(async () => ({ id })),
    doStream: vi.fn(async () => ({ id })),
  } as unknown as LanguageModelV4 & {
    doGenerate: ReturnType<typeof vi.fn>;
    doStream: ReturnType<typeof vi.fn>;
  };
}

/** Builds a gateway whose factory hands back one recording model per route. */
function gatewayWith(models: Record<string, ReturnType<typeof upstream>>) {
  const factory: ProviderFactory = (route) => {
    const found = Object.entries(models).find(
      ([, model]) => model.modelId === route.model,
    );
    if (!found) {
      throw new Error(`no test model for ${route.model}`);
    }
    return found[1];
  };
  return new LlmGateway({
    routes,
    credentials,
    factories: { 'openai-compatible': factory, bedrock: factory },
  });
}

const textPrompt = [
  { role: 'user', content: [{ type: 'text', text: 'hello' }] },
] as unknown as LanguageModelV4CallOptions['prompt'];

const imagePrompt = [
  {
    role: 'user',
    content: [
      { type: 'text', text: 'what is this' },
      { type: 'file', mediaType: 'image/png', data: 'x' },
    ],
  },
] as unknown as LanguageModelV4CallOptions['prompt'];

const call = (
  prompt: LanguageModelV4CallOptions['prompt'],
  extra: Partial<LanguageModelV4CallOptions> = {},
) => ({ prompt, ...extra }) as LanguageModelV4CallOptions;

const alwaysReasons = () => true;
const neverReasons = () => false;

describe('a gateway-backed chat model', () => {
  it('resolves nothing until it is called', () => {
    const resolveModel = vi.spyOn(LlmGateway.prototype, 'resolveModel');
    const gateway = gatewayWith({ oss: upstream('gpt-oss-120b') });

    nativeChatModel(gateway, {
      modelId: 'gpt-oss-120b',
      supportsReasoningEffort: neverReasons,
      multimodal: { textOnlyModels: new Set() },
    });

    expect(resolveModel).not.toHaveBeenCalled();
    resolveModel.mockRestore();
  });

  it('delegates to the routed upstream', async () => {
    const oss = upstream('gpt-oss-120b');
    const model = nativeChatModel(gatewayWith({ oss }), {
      modelId: 'gpt-oss-120b',
      supportsReasoningEffort: neverReasons,
      multimodal: { textOnlyModels: new Set() },
    });

    await model.doStream(call(textPrompt));

    expect(oss.doStream).toHaveBeenCalledOnce();
  });

  it('reports the requested model id, not the upstream spelling', () => {
    const model = nativeChatModel(
      gatewayWith({ sonnet: upstream('eu.anthropic.claude-sonnet-5') }),
      {
        modelId: 'claude-sonnet-5',
        supportsReasoningEffort: neverReasons,
        multimodal: { textOnlyModels: new Set() },
      },
    );

    expect(model.modelId).toBe('claude-sonnet-5');
  });

  describe('the multimodal swap', () => {
    const policy = {
      textOnlyModels: new Set(['gpt-oss-120b']),
      fallbackModel: 'mistral-small-3.2',
    };

    it('stays on the text-only model for a text-only turn', async () => {
      const oss = upstream('gpt-oss-120b');
      const mistral = upstream('mistral-small-3.2-24b-instruct-2506');
      const model = nativeChatModel(gatewayWith({ oss, mistral }), {
        modelId: 'gpt-oss-120b',
        supportsReasoningEffort: neverReasons,
        multimodal: policy,
      });

      await model.doStream(call(textPrompt));

      expect(oss.doStream).toHaveBeenCalledOnce();
      expect(mistral.doStream).not.toHaveBeenCalled();
    });

    /**
     * The behaviour that could not be expressed at construction time — the
     * whole reason resolution is deferred.
     */
    it('swaps to the vision model when the turn carries an image', async () => {
      const oss = upstream('gpt-oss-120b');
      const mistral = upstream('mistral-small-3.2-24b-instruct-2506');
      const model = nativeChatModel(gatewayWith({ oss, mistral }), {
        modelId: 'gpt-oss-120b',
        supportsReasoningEffort: neverReasons,
        multimodal: policy,
      });

      await model.doStream(call(imagePrompt));

      expect(mistral.doStream).toHaveBeenCalledOnce();
      expect(oss.doStream).not.toHaveBeenCalled();
    });

    /** One model instance, two turns, two different upstreams. */
    it('decides per turn rather than once per instance', async () => {
      const oss = upstream('gpt-oss-120b');
      const mistral = upstream('mistral-small-3.2-24b-instruct-2506');
      const model = nativeChatModel(gatewayWith({ oss, mistral }), {
        modelId: 'gpt-oss-120b',
        supportsReasoningEffort: neverReasons,
        multimodal: policy,
      });

      await model.doStream(call(textPrompt));
      await model.doStream(call(imagePrompt));
      await model.doStream(call(textPrompt));

      expect(oss.doStream).toHaveBeenCalledTimes(2);
      expect(mistral.doStream).toHaveBeenCalledTimes(1);
    });
  });

  describe('reasoning effort', () => {
    it('is sent as providerOptions for a model that accepts it', async () => {
      const oss = upstream('gpt-oss-120b');
      const model = nativeChatModel(gatewayWith({ oss }), {
        modelId: 'gpt-oss-120b',
        reasoningEffort: 'high',
        supportsReasoningEffort: alwaysReasons,
        multimodal: { textOnlyModels: new Set() },
      });

      await model.doGenerate(call(textPrompt));

      expect(oss.doGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          providerOptions: { openai: { reasoningEffort: 'high' } },
        }),
      );
    });

    /**
     * `drop_params: true` is gone with the proxy, so sending this to a model
     * that does not understand it is an upstream error rather than a no-op.
     */
    it('is withheld from a model that does not accept it', async () => {
      const oss = upstream('gpt-oss-120b');
      const model = nativeChatModel(gatewayWith({ oss }), {
        modelId: 'gpt-oss-120b',
        reasoningEffort: 'high',
        supportsReasoningEffort: neverReasons,
        multimodal: { textOnlyModels: new Set() },
      });

      await model.doGenerate(call(textPrompt));

      expect(oss.doGenerate.mock.calls[0][0].providerOptions).toBeUndefined();
    });

    it('is withheld from a provider family that has no such option', async () => {
      const sonnet = upstream('eu.anthropic.claude-sonnet-5');
      const model = nativeChatModel(gatewayWith({ sonnet }), {
        modelId: 'claude-sonnet-5',
        reasoningEffort: 'high',
        supportsReasoningEffort: alwaysReasons,
        multimodal: { textOnlyModels: new Set() },
      });

      await model.doGenerate(call(textPrompt));

      expect(
        sonnet.doGenerate.mock.calls[0][0].providerOptions,
      ).toBeUndefined();
    });

    it('does not override provider options the caller set explicitly', async () => {
      const oss = upstream('gpt-oss-120b');
      const model = nativeChatModel(gatewayWith({ oss }), {
        modelId: 'gpt-oss-120b',
        reasoningEffort: 'low',
        supportsReasoningEffort: alwaysReasons,
        multimodal: { textOnlyModels: new Set() },
      });

      await model.doGenerate(
        call(textPrompt, {
          providerOptions: { openai: { reasoningEffort: 'high' } },
        }),
      );

      expect(oss.doGenerate).toHaveBeenCalledWith(
        expect.objectContaining({
          providerOptions: { openai: { reasoningEffort: 'high' } },
        }),
      );
    });
  });

  describe('caching', () => {
    it('resolves each upstream once across turns', async () => {
      const oss = upstream('gpt-oss-120b');
      const gateway = gatewayWith({ oss });
      const resolveModel = vi.spyOn(gateway, 'resolveModel');

      const model = nativeChatModel(gateway, {
        modelId: 'gpt-oss-120b',
        supportsReasoningEffort: neverReasons,
        multimodal: { textOnlyModels: new Set() },
      });

      await model.doStream(call(textPrompt));
      await model.doStream(call(textPrompt));
      await model.doStream(call(textPrompt));

      expect(resolveModel).toHaveBeenCalledTimes(1);
    });

    /**
     * A transient credential failure must not poison the instance — a chain is
     * long-lived and would otherwise never recover.
     */
    it('does not cache a failed resolution', async () => {
      const failing: CredentialSource = {
        forProvider: vi
          .fn()
          .mockRejectedValueOnce(new Error('vault unreachable'))
          .mockResolvedValue({ apiKey: 'k', baseUrl: 'https://u' }),
      };
      const oss = upstream('gpt-oss-120b');
      const gateway = new LlmGateway({
        routes,
        credentials: failing,
        factories: { 'openai-compatible': () => oss },
      });

      const model = nativeChatModel(gateway, {
        modelId: 'gpt-oss-120b',
        supportsReasoningEffort: neverReasons,
        multimodal: { textOnlyModels: new Set() },
      });

      await expect(model.doStream(call(textPrompt))).rejects.toThrow(
        'vault unreachable',
      );
      await expect(model.doStream(call(textPrompt))).resolves.toBeDefined();
    });
  });
});

describe('the configured temperature', () => {
  it('is forwarded to doGenerate when the caller sets none', async () => {
    const oss = upstream('gpt-oss-120b');
    const model = nativeChatModel(gatewayWith({ oss }), {
      modelId: 'gpt-oss-120b',
      temperature: 0.2,
      supportsReasoningEffort: neverReasons,
      multimodal: { textOnlyModels: new Set() },
    });

    await model.doGenerate(call(textPrompt));

    expect(oss.doGenerate.mock.calls[0][0].temperature).toBe(0.2);
  });

  it('is forwarded to doStream too', async () => {
    const oss = upstream('gpt-oss-120b');
    const model = nativeChatModel(gatewayWith({ oss }), {
      modelId: 'gpt-oss-120b',
      temperature: 0.2,
      supportsReasoningEffort: neverReasons,
      multimodal: { textOnlyModels: new Set() },
    });

    await model.doStream(call(textPrompt));

    expect(oss.doStream.mock.calls[0][0].temperature).toBe(0.2);
  });

  it('never overrides one the caller asked for', async () => {
    const oss = upstream('gpt-oss-120b');
    const model = nativeChatModel(gatewayWith({ oss }), {
      modelId: 'gpt-oss-120b',
      temperature: 0.2,
      supportsReasoningEffort: neverReasons,
      multimodal: { textOnlyModels: new Set() },
    });

    await model.doGenerate(call(textPrompt, { temperature: 0.9 }));

    expect(oss.doGenerate.mock.calls[0][0].temperature).toBe(0.9);
  });

  it('leaves temperature unset when the seam configured none', async () => {
    const oss = upstream('gpt-oss-120b');
    const model = nativeChatModel(gatewayWith({ oss }), {
      modelId: 'gpt-oss-120b',
      supportsReasoningEffort: neverReasons,
      multimodal: { textOnlyModels: new Set() },
    });

    await model.doGenerate(call(textPrompt));

    expect(oss.doGenerate.mock.calls[0][0].temperature).toBeUndefined();
  });
});

describe('merging provider options', () => {
  /**
   * The regression this guards: a shallow spread replaced the whole `openai`
   * namespace, so any unrelated caller option silently dropped the configured
   * reasoning effort.
   */
  it('keeps the reasoning default alongside an unrelated caller option', async () => {
    const oss = upstream('gpt-oss-120b');
    const model = nativeChatModel(gatewayWith({ oss }), {
      modelId: 'gpt-oss-120b',
      reasoningEffort: 'high',
      supportsReasoningEffort: alwaysReasons,
      multimodal: { textOnlyModels: new Set() },
    });

    await model.doGenerate(
      call(textPrompt, {
        providerOptions: { openai: { parallelToolCalls: false } },
      }),
    );

    expect(oss.doGenerate.mock.calls[0][0].providerOptions?.openai).toEqual({
      reasoningEffort: 'high',
      parallelToolCalls: false,
    });
  });

  it('still lets the caller override the effort explicitly', async () => {
    const oss = upstream('gpt-oss-120b');
    const model = nativeChatModel(gatewayWith({ oss }), {
      modelId: 'gpt-oss-120b',
      reasoningEffort: 'high',
      supportsReasoningEffort: alwaysReasons,
      multimodal: { textOnlyModels: new Set() },
    });

    await model.doGenerate(
      call(textPrompt, {
        providerOptions: { openai: { reasoningEffort: 'low' } },
      }),
    );

    expect(oss.doGenerate.mock.calls[0][0].providerOptions?.openai).toEqual({
      reasoningEffort: 'low',
    });
  });

  it('leaves another provider namespace untouched', async () => {
    const oss = upstream('gpt-oss-120b');
    const model = nativeChatModel(gatewayWith({ oss }), {
      modelId: 'gpt-oss-120b',
      reasoningEffort: 'high',
      supportsReasoningEffort: alwaysReasons,
      multimodal: { textOnlyModels: new Set() },
    });

    await model.doGenerate(
      call(textPrompt, { providerOptions: { anthropic: { topK: 5 } } }),
    );

    const sent = oss.doGenerate.mock.calls[0][0].providerOptions;
    expect(sent?.anthropic).toEqual({ topK: 5 });
    expect(sent?.openai).toEqual({ reasoningEffort: 'high' });
  });
});
