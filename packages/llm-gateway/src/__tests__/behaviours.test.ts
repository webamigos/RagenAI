import { describe, expect, it } from 'vitest';

import { multimodalPolicyFromEnv, selectModelForContent } from '../multimodal';
import { reasoningEffortOptions } from '../reasoning-effort';

const policy = {
  textOnlyModels: new Set(['gpt-oss-120b']),
  fallbackModel: 'mistral-small-3.2',
};

const withImage = [{ content: [{ type: 'text' }, { type: 'image' }] }] as const;
const textOnly = [{ content: [{ type: 'text' }] }] as const;

describe('the multimodal swap', () => {
  it('routes a text-only model to the vision model when an image is present', () => {
    expect(selectModelForContent('gpt-oss-120b', withImage, policy)).toBe(
      'mistral-small-3.2',
    );
  });

  it('leaves the model alone when the turn is text', () => {
    expect(selectModelForContent('gpt-oss-120b', textOnly, policy)).toBe(
      'gpt-oss-120b',
    );
  });

  it('leaves a vision-capable model alone even with an image', () => {
    expect(selectModelForContent('gpt-5.4', withImage, policy)).toBe('gpt-5.4');
  });

  it('does nothing at all when no fallback is configured', () => {
    // Both variables have to be set, as before. A half-configured swap that
    // silently redirected to `undefined` would be worse than none.
    expect(
      selectModelForContent('gpt-oss-120b', withImage, {
        textOnlyModels: new Set(['gpt-oss-120b']),
      }),
    ).toBe('gpt-oss-120b');
  });

  it('recognises provider-native part names, not only the SDK ones', () => {
    // A caller may hand over messages it built itself; the previous
    // implementation matched these spellings and dropping them would narrow
    // the gate without anyone noticing.
    for (const type of ['image_url', 'input_image', 'file', 'document']) {
      expect(
        selectModelForContent(
          'gpt-oss-120b',
          [{ content: [{ type }] }],
          policy,
        ),
      ).toBe('mistral-small-3.2');
    }
  });

  it('survives a message whose content is a bare string', () => {
    expect(
      selectModelForContent('gpt-oss-120b', [{ content: 'hi' }], policy),
    ).toBe('gpt-oss-120b');
  });

  it('reads its policy from the same variables as before', () => {
    const fromEnv = multimodalPolicyFromEnv({
      MULTIMODAL_TEXT_ONLY_MODELS: ' a , b ,',
      MULTIMODAL_FALLBACK_MODEL: 'v',
    } as NodeJS.ProcessEnv);

    expect([...fromEnv.textOnlyModels]).toEqual(['a', 'b']);
    expect(fromEnv.fallbackModel).toBe('v');
  });
});

describe('reasoning effort', () => {
  const supports = (id: string) => id === 'gpt-oss-120b';

  it('becomes a providerOptions fragment, not a body field', () => {
    expect(
      reasoningEffortOptions(
        'openai-compatible',
        'gpt-oss-120b',
        'high',
        supports,
      ),
    ).toEqual({ openai: { reasoningEffort: 'high' } });
  });

  it('is omitted for a model that does not reason', () => {
    // LiteLLM's `drop_params: true` used to strip this again downstream. That
    // crutch is gone, so sending it to the wrong model is now an upstream
    // error rather than a silent no-op.
    expect(
      reasoningEffortOptions('openai-compatible', 'gpt-5.4', 'high', supports),
    ).toBeUndefined();
  });

  it('is omitted for providers that do not speak the OpenAI dialect', () => {
    expect(
      reasoningEffortOptions('bedrock', 'gpt-oss-120b', 'high', supports),
    ).toBeUndefined();
    expect(
      reasoningEffortOptions('vertex', 'gpt-oss-120b', 'high', supports),
    ).toBeUndefined();
  });

  it('is omitted when no effort was requested', () => {
    expect(
      reasoningEffortOptions('azure', 'gpt-oss-120b', undefined, supports),
    ).toBeUndefined();
  });
});
