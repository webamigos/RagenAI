import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModelV3 } from '@ai-sdk/provider';

import type { BaseCompletionConfig, LiteLLMCredentials } from './types';

export class ChatCompletionFactory {
  static createInstance(
    credentials: LiteLLMCredentials,
    config: BaseCompletionConfig,
  ): LanguageModelV3 {
    if (!credentials.baseUrl) {
      throw new Error('LiteLLM baseUrl is required');
    }

    const baseUrl = credentials.baseUrl.endsWith('/')
      ? credentials.baseUrl.slice(0, -1)
      : credentials.baseUrl;

    const litellm = createOpenAI({
      baseURL: `${baseUrl}/v1`,
      apiKey: credentials.apiKey || 'sk-litellm',
    });

    // Use .chat() to hit /chat/completions instead of /responses (which LiteLLM doesn't support)
    return litellm.chat(config.model || 'gpt-5.4-nano');
  }
}
