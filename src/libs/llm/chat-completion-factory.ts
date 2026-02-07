import { ChatOpenAI, AzureChatOpenAI } from '@langchain/openai';
import { BedrockChat } from '@langchain/community/chat_models/bedrock';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOllama } from '@langchain/ollama';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatFireworks } from '@langchain/community/chat_models/fireworks';

import type {
  BedrockCredentials,
  OpenAICredentials,
  ProviderCredentials,
  BaseCompletionConfig,
  OllamaCredentials,
  GoogleCredentials,
  AnthropicCredentials,
  OpenRouterCredentials,
  FireworksCredentials,
  AzureOpenAICredentials,
} from './types';

export class ChatCompletionFactory {
  private static createBedrockInstance(
    credentials: BedrockCredentials,
    config: BaseCompletionConfig
  ): BaseChatModel {
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
    }) as BaseChatModel;
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

  private static createOllamaInstance(
    credentials: OllamaCredentials,
    config: BaseCompletionConfig
  ): ChatOllama {
    return new ChatOllama({
      ...config,
      checkOrPullModel: true,
      baseUrl: credentials.baseUrl,
    });
  }

  private static createAnthropicInstance(
    credentials: AnthropicCredentials,
    config: BaseCompletionConfig
  ): ChatAnthropic {
    if (!credentials.apiKey) {
      throw new Error('API key is required for Anthropic');
    }

    return new ChatAnthropic({
      ...config,
      apiKey: credentials.apiKey,
    });
  }

  private static createGoogleInstance(
    credentials: GoogleCredentials,
    config: BaseCompletionConfig
  ): ChatGoogleGenerativeAI {
    if (!credentials.apiKey) {
      throw new Error('API key is required for Google');
    }

    return new ChatGoogleGenerativeAI({
      ...config,
      apiKey: credentials.apiKey,
    });
  }

  // OpenAI SDK is officially recommended for OpenRouter
  //https://openrouter.ai/docs/quickstart
  private static createOpenRouterInstance(
    credentials: OpenRouterCredentials,
    config: BaseCompletionConfig
  ): ChatOpenAI {
    if (!credentials.apiKey) {
      throw new Error('API key is required for OpenRouter');
    }

    return new ChatOpenAI({
      ...config,
      apiKey: credentials.apiKey,
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
      },
    });
  }

  private static createFireworksInstance(
    credentials: FireworksCredentials,
    config: BaseCompletionConfig
  ): ChatFireworks {
    if (!credentials.apiKey) {
      throw new Error('API key is required for Fireworks');
    }

    return new ChatFireworks({
      ...config,
      apiKey: credentials.apiKey,
    });
  }

  private static createAzureOpenAIInstance(
    credentials: AzureOpenAICredentials,
    config: BaseCompletionConfig
  ): AzureChatOpenAI {
    if (!credentials.apiKey) {
      throw new Error('API key is required for Azure OpenAI');
    }

    if (!credentials.instanceName) {
      throw new Error('Instance name is required for Azure OpenAI');
    }

    if (!credentials.deploymentName) {
      throw new Error('Deployment name is required for Azure OpenAI');
    }

    if (!credentials.apiVersion) {
      throw new Error('API version is required for Azure OpenAI');
    }

    return new AzureChatOpenAI({
      ...config,
      azureOpenAIApiKey: credentials.apiKey,
      azureOpenAIApiInstanceName: credentials.instanceName,
      azureOpenAIApiDeploymentName: credentials.deploymentName,
      azureOpenAIApiVersion: credentials.apiVersion,
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
      case 'ollama':
        return this.createOllamaInstance(credentials, config);
      case 'anthropic':
        return this.createAnthropicInstance(credentials, config);
      case 'google':
        return this.createGoogleInstance(credentials, config);
      case 'openrouter':
        return this.createOpenRouterInstance(credentials, config);
      case 'fireworks':
        return this.createFireworksInstance(credentials, config);
      case 'azure-openai':
        return this.createAzureOpenAIInstance(credentials, config);
      default:
        throw new Error(`Unsupported LLM provider`);
    }
  }
}
