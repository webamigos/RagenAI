import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAzure } from '@ai-sdk/azure';
import { createFireworks } from '@ai-sdk/fireworks';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import type { LanguageModelV3 } from '@ai-sdk/provider';

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
    config: BaseCompletionConfig,
  ): LanguageModelV3 {
    if (!credentials.credentials) {
      throw new Error('Credentials are required for Bedrock');
    }

    if (!credentials.region) {
      throw new Error('Region is required for Bedrock');
    }

    const bedrock = createAmazonBedrock({
      region: credentials.region,
      accessKeyId: credentials.credentials.accessKeyId,
      secretAccessKey: credentials.credentials.secretAccessKey,
    });

    return bedrock(config.model || 'anthropic.claude-3-haiku-20240307-v1:0');
  }

  private static createOpenAIInstance(
    credentials: OpenAICredentials,
    config: BaseCompletionConfig,
  ): LanguageModelV3 {
    if (!credentials.apiKey) {
      throw new Error('API key is required for OpenAI');
    }

    const openai = createOpenAI({
      apiKey: credentials.apiKey,
    });

    return openai(config.model || 'gpt-4o');
  }

  // Ollama exposes an OpenAI-compatible API, so we use @ai-sdk/openai with a custom baseURL
  private static createOllamaInstance(
    credentials: OllamaCredentials,
    config: BaseCompletionConfig,
  ): LanguageModelV3 {
    const baseUrl = credentials.baseUrl.endsWith('/')
      ? credentials.baseUrl.slice(0, -1)
      : credentials.baseUrl;

    const ollama = createOpenAI({
      baseURL: `${baseUrl}/v1`,
      apiKey: 'ollama', // Ollama doesn't require a real API key
    });

    return ollama(config.model || 'llama3.1');
  }

  private static createAnthropicInstance(
    credentials: AnthropicCredentials,
    config: BaseCompletionConfig,
  ): LanguageModelV3 {
    if (!credentials.apiKey) {
      throw new Error('API key is required for Anthropic');
    }

    const anthropic = createAnthropic({
      apiKey: credentials.apiKey,
    });

    return anthropic(config.model || 'claude-sonnet-4-6');
  }

  private static createGoogleInstance(
    credentials: GoogleCredentials,
    config: BaseCompletionConfig,
  ): LanguageModelV3 {
    if (!credentials.apiKey) {
      throw new Error('API key is required for Google');
    }

    const google = createGoogleGenerativeAI({
      apiKey: credentials.apiKey,
    });

    return google(config.model || 'gemini-3-flash-preview');
  }

  private static createOpenRouterInstance(
    credentials: OpenRouterCredentials,
    config: BaseCompletionConfig,
  ): LanguageModelV3 {
    if (!credentials.apiKey) {
      throw new Error('API key is required for OpenRouter');
    }

    const openrouter = createOpenRouter({
      apiKey: credentials.apiKey,
    });

    return openrouter(config.model || 'google/gemini-3-flash-preview', {
      ...(config.reasoning
        ? { reasoning: { enabled: true, max_tokens: 2048 } }
        : {}),
    });
  }

  private static createFireworksInstance(
    credentials: FireworksCredentials,
    config: BaseCompletionConfig,
  ): LanguageModelV3 {
    if (!credentials.apiKey) {
      throw new Error('API key is required for Fireworks');
    }

    const fireworks = createFireworks({
      apiKey: credentials.apiKey,
    });

    return fireworks(
      config.model || 'accounts/fireworks/models/llama-v3p2-3b-instruct',
    );
  }

  private static createAzureOpenAIInstance(
    credentials: AzureOpenAICredentials,
    _config: BaseCompletionConfig,
  ): LanguageModelV3 {
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

    const azure = createAzure({
      apiKey: credentials.apiKey,
      resourceName: credentials.instanceName,
    });

    return azure(credentials.deploymentName);
  }

  static createInstance(
    credentials: ProviderCredentials,
    config: BaseCompletionConfig,
  ): LanguageModelV3 {
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
