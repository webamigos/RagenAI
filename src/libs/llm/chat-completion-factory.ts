import { ChatOpenAI } from '@langchain/openai';
import { BedrockChat } from '@langchain/community/chat_models/bedrock';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type {
  BedrockCredentials,
  OpenAICredentials,
  ProviderCredentials,
  BaseCompletionConfig,
} from './types';

export class ChatCompletionFactory {
  private static createBedrockInstance(
    credentials: BedrockCredentials,
    config: BaseCompletionConfig
  ): BedrockChat {
    if (!credentials.credentials) {
      throw new Error('Credentials are required for Bedrock');
    }

    if (!credentials.region) {
      throw new Error('Region is required for Bedrock');
    }

    return new BedrockChat({
      ...config,
      region: credentials.region,
      credentials: credentials.credentials,
    });
  }

  private static createOpenAIInstance(
    credentials: OpenAICredentials,
    config: BaseCompletionConfig
  ): ChatOpenAI {
    if (!credentials.apiKey) {
      throw new Error('API key is required for OpenAI');
    }

    return new ChatOpenAI({
      ...config,
      apiKey: credentials.apiKey,
    });
  }

  static createInstance(
    credentials: ProviderCredentials,
    config: BaseCompletionConfig
  ): BaseChatModel {
    switch (credentials.provider) {
      case 'bedrock':
        return this.createBedrockInstance(credentials, config);
      case 'openai':
        return this.createOpenAIInstance(credentials, config);
      default:
        throw new Error(`Unsupported LLM provider`);
    }
  }
}
