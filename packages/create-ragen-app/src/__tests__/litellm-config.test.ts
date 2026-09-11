import { describe, expect, it } from 'vitest';

import { addLiteLLMModel } from '../litellm-config';

describe('addLiteLLMModel', () => {
  it('inserts the new entry right after `model_list:`, leaving the rest byte-identical', () => {
    const original = [
      'model_list:',
      '  # Azure OpenAI',
      '  - model_name: gpt-5.4',
      '    litellm_params:',
      '      model: azure/gpt-5.4',
      '',
      'litellm_settings:',
      '  drop_params: true',
    ].join('\n');

    const result = addLiteLLMModel(original, {
      modelName: 'gpt-4o-mini',
      model: 'openai/gpt-4o-mini',
      apiKeyEnvVar: 'OPENAI_API_KEY',
    });

    expect(result).toBe(
      [
        'model_list:',
        '  - model_name: gpt-4o-mini',
        '    litellm_params:',
        '      model: openai/gpt-4o-mini',
        '      api_key: os.environ/OPENAI_API_KEY',
        '',
        '  # Azure OpenAI',
        '  - model_name: gpt-5.4',
        '    litellm_params:',
        '      model: azure/gpt-5.4',
        '',
        'litellm_settings:',
        '  drop_params: true',
      ].join('\n'),
    );
  });

  it('throws when the config has no `model_list:` key', () => {
    expect(() =>
      addLiteLLMModel('litellm_settings:\n  drop_params: true', {
        modelName: 'gpt-4o-mini',
        model: 'openai/gpt-4o-mini',
        apiKeyEnvVar: 'OPENAI_API_KEY',
      }),
    ).toThrow(/model_list/);
  });
});
