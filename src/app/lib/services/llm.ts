import { z } from 'zod';
import type { LanguageModelV3 } from '@ai-sdk/provider';
import OpenAI from 'openai';
import { ChatCompletionFactory, type ProviderCredentials } from '@/libs/llm';
import { EmbeddingsFactory } from '@/libs/llm/embeddings-factory';
import type { ChatCompletionOptions } from '@/libs/llm/types/chat-completion';
import {
  getModelProvider,
  isReasoningModel,
  normalizeModelId,
  type ModelProvider,
} from '../../components/config';
import {
  getOpenaiAPIKey,
  getAnthropicAPIKey,
  getGoogleAPIKey,
  getBedrockCredentials,
  getOllamaHost,
  getOpenrouterAPIKey,
  getFireworksAPIKey,
  getAzureOpenAICredentials,
} from '@/features/organizations/services/organization-settings';
import { usageTracker } from './usage';
import { logger } from '../utils/logger';

export const MODELS_MAP = {
  // Legacy provider-specific entries (for backward compatibility with existing ENV vars)
  google: [
    'gemini-2.0-flash',
    'google/gemini-3-flash-preview',
    'google/gemini-2.0-flash-001',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'o3-mini',
    'openai/gpt-5.2',
    'openai/gpt-5.2-chat',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/o3-mini',
  ],
  anthropic: [
    'claude-3-5-sonnet-20241022',
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-3.7-sonnet',
  ],
  bedrock: [
    'anthropic.claude-3-7-sonnet-20250219-v1:0',
    'anthropic.claude-3-5-haiku-20241022-v1:0',
    'anthropic.claude-3-5-sonnet-20241022-v2:0',
  ],
  ['azure-openai']: ['gpt-4o'],
  vertex: [
    'claude-3-7-sonnet@20250219',
    'claude-3-5-haiku@20241022',
    'claude-3-5-sonnet-v2@20241022',
  ],
  ollama: ['llama3.1'],
  openrouter: [
    'openai/gpt-5.2',
    'openai/gpt-5.2-chat',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/o3-mini',
    'google/gemini-3-flash-preview',
    'google/gemini-2.0-flash-001',
    'anthropic/claude-haiku-4.5',
    'anthropic/claude-3.7-sonnet',
    'perplexity/sonar-pro',
  ],
  fireworks: ['accounts/fireworks/models/llama-v3p2-3b-instruct'],
} as const;

export const modelsSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('google'),
    model: z.enum(MODELS_MAP.google),
  }),
  z.object({
    provider: z.literal('openai'),
    model: z.enum(MODELS_MAP.openai),
  }),
  z.object({
    provider: z.literal('anthropic'),
    model: z.enum(MODELS_MAP.anthropic),
  }),
  z.object({
    provider: z.literal('bedrock'),
    model: z.enum(MODELS_MAP.bedrock),
  }),
  z.object({
    provider: z.literal('vertex'),
    model: z.enum(MODELS_MAP.vertex),
  }),
  z.object({
    provider: z.literal('ollama'),
    model: z.enum(MODELS_MAP.ollama),
  }),
  z.object({
    provider: z.literal('openrouter'),
    model: z.enum(MODELS_MAP.openrouter),
  }),
  z.object({
    provider: z.literal('fireworks'),
    model: z.enum(MODELS_MAP.fireworks),
  }),
  z.object({
    provider: z.literal('azure-openai'),
    model: z.enum(MODELS_MAP['azure-openai']),
  }),
]);

const modelConfig = modelsSchema.parse({
  provider: process.env.DEFAULT_MODEL_PROVIDER,
  model: process.env.DEFAULT_MODEL,
});

// Models that don't support temperature parameter (reasoning/thinking models)
const modelsWithoutTemperature = ['openai/o3-mini', 'openai/gpt-5.2'];

// Helper function to check if model supports temperature
const supportsTemperature = (model: string): boolean => {
  if (!model) {
    return true;
  }
  return !modelsWithoutTemperature.includes(model);
};

// Function to create credentials for a specific provider
const createCredentialsForProvider = (
  provider: ModelProvider,
): ProviderCredentials | null => {
  switch (provider) {
    case 'openai':
      return {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY!,
      };

    case 'google': {
      const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
      if (!GOOGLE_API_KEY) {
        return null;
      }
      return {
        provider: 'google',
        apiKey: GOOGLE_API_KEY,
      };
    }

    case 'anthropic': {
      const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
      if (!ANTHROPIC_API_KEY) {
        return null;
      }
      return {
        provider: 'anthropic',
        apiKey: ANTHROPIC_API_KEY,
      };
    }

    case 'bedrock': {
      const AWS_REGION = process.env.AWS_REGION;
      const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
      const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
      if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
        return null;
      }
      return {
        provider: 'bedrock',
        region: AWS_REGION,
        credentials: {
          accessKeyId: AWS_ACCESS_KEY_ID,
          secretAccessKey: AWS_SECRET_ACCESS_KEY,
        },
      };
    }

    case 'ollama': {
      const OLLAMA_HOST = process.env.OLLAMA_HOST;
      if (!OLLAMA_HOST) {
        return null;
      }
      return {
        provider: 'ollama',
        baseUrl: OLLAMA_HOST,
      };
    }

    case 'openrouter': {
      const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
      if (!OPENROUTER_API_KEY) {
        return null;
      }
      return {
        provider: 'openrouter',
        apiKey: OPENROUTER_API_KEY,
      };
    }

    case 'fireworks': {
      const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;
      if (!FIREWORKS_API_KEY) {
        return null;
      }
      return {
        provider: 'fireworks',
        apiKey: FIREWORKS_API_KEY,
      };
    }

    case 'azure-openai': {
      const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY;
      const AZURE_OPENAI_INSTANCE = process.env.AZURE_OPENAI_INSTANCE;
      const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
      const AZURE_OPENAI_VERSION = process.env.AZURE_OPENAI_VERSION;
      if (
        !AZURE_OPENAI_KEY ||
        !AZURE_OPENAI_INSTANCE ||
        !AZURE_OPENAI_DEPLOYMENT ||
        !AZURE_OPENAI_VERSION
      ) {
        return null;
      }
      return {
        provider: 'azure-openai',
        apiKey: AZURE_OPENAI_KEY,
        instanceName: AZURE_OPENAI_INSTANCE,
        deploymentName: AZURE_OPENAI_DEPLOYMENT,
        apiVersion: AZURE_OPENAI_VERSION,
      };
    }

    default:
      return null;
  }
};

// Function to create credentials for a specific provider, checking organization settings first
const createCredentialsForProviderWithOrg = async (
  provider: ModelProvider,
  orgId: string,
): Promise<ProviderCredentials | null> => {
  switch (provider) {
    case 'openai': {
      const orgKey = await getOpenaiAPIKey(orgId);
      if (orgKey) {
        return {
          provider: 'openai',
          apiKey: orgKey,
        };
      }
      const envKey = process.env.OPENAI_API_KEY;
      if (envKey) {
        return {
          provider: 'openai',
          apiKey: envKey,
        };
      }
      return null;
    }

    case 'google': {
      const orgKey = await getGoogleAPIKey(orgId);
      if (orgKey) {
        return {
          provider: 'google',
          apiKey: orgKey,
        };
      }
      const envKey = process.env.GOOGLE_API_KEY;
      if (envKey) {
        return {
          provider: 'google',
          apiKey: envKey,
        };
      }
      return null;
    }

    case 'anthropic': {
      const orgKey = await getAnthropicAPIKey(orgId);
      if (orgKey) {
        return {
          provider: 'anthropic',
          apiKey: orgKey,
        };
      }
      const envKey = process.env.ANTHROPIC_API_KEY;
      if (envKey) {
        return {
          provider: 'anthropic',
          apiKey: envKey,
        };
      }
      return null;
    }

    case 'bedrock': {
      const orgCreds = await getBedrockCredentials(orgId);
      if (orgCreds) {
        return {
          provider: 'bedrock',
          region: orgCreds.region,
          credentials: {
            accessKeyId: orgCreds.accessKeyId,
            secretAccessKey: orgCreds.secretAccessKey,
          },
        };
      }
      const envRegion = process.env.AWS_REGION;
      const envAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
      const envSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
      if (envRegion && envAccessKeyId && envSecretAccessKey) {
        return {
          provider: 'bedrock',
          region: envRegion,
          credentials: {
            accessKeyId: envAccessKeyId,
            secretAccessKey: envSecretAccessKey,
          },
        };
      }
      return null;
    }

    case 'ollama': {
      const orgHost = await getOllamaHost(orgId);
      if (orgHost) {
        return {
          provider: 'ollama',
          baseUrl: orgHost,
        };
      }
      const envHost = process.env.OLLAMA_HOST;
      if (envHost) {
        return {
          provider: 'ollama',
          baseUrl: envHost,
        };
      }
      return null;
    }

    case 'openrouter': {
      const orgKey = await getOpenrouterAPIKey(orgId);
      if (orgKey) {
        return {
          provider: 'openrouter',
          apiKey: orgKey,
        };
      }
      const envKey = process.env.OPENROUTER_API_KEY;
      if (envKey) {
        return {
          provider: 'openrouter',
          apiKey: envKey,
        };
      }
      return null;
    }

    case 'fireworks': {
      const orgKey = await getFireworksAPIKey(orgId);
      if (orgKey) {
        return {
          provider: 'fireworks',
          apiKey: orgKey,
        };
      }
      const envKey = process.env.FIREWORKS_API_KEY;
      if (envKey) {
        return {
          provider: 'fireworks',
          apiKey: envKey,
        };
      }
      return null;
    }

    case 'azure-openai': {
      const orgCreds = await getAzureOpenAICredentials(orgId);
      if (orgCreds) {
        return {
          provider: 'azure-openai',
          apiKey: orgCreds.apiKey,
          instanceName: orgCreds.instanceName,
          deploymentName: orgCreds.deploymentName,
          apiVersion: orgCreds.apiVersion,
        };
      }
      const envKey = process.env.AZURE_OPENAI_KEY;
      const envInstance = process.env.AZURE_OPENAI_INSTANCE;
      const envDeployment = process.env.AZURE_OPENAI_DEPLOYMENT;
      const envVersion = process.env.AZURE_OPENAI_VERSION;
      if (envKey && envInstance && envDeployment && envVersion) {
        return {
          provider: 'azure-openai',
          apiKey: envKey,
          instanceName: envInstance,
          deploymentName: envDeployment,
          apiVersion: envVersion,
        };
      }
      return null;
    }

    default:
      return null;
  }
};

let customChatModel: string | null = null;
let customCredentials: ProviderCredentials | null = null;

switch (modelConfig.provider) {
  case 'bedrock': {
    const AWS_REGION = process.env.AWS_REGION;
    const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
    const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

    if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      logger.error(
        `Specify values for env variables: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY`,
      );
      throw new Error(
        `Specify values for env variables: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY`,
      );
    }

    customCredentials = {
      provider: 'bedrock',
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY,
      },
    };
    customChatModel = 'anthropic.claude-3-haiku-20240307-v1:0';
    break;
  }

  case 'ollama': {
    const OLLAMA_HOST = process.env.OLLAMA_HOST;

    if (!OLLAMA_HOST) {
      logger.error(`Specify values for env variables: OLLAMA_HOST`);
      throw new Error(`Specify values for env variables: OLLAMA_HOST`);
    }

    customCredentials = {
      provider: 'ollama',
      baseUrl: OLLAMA_HOST,
    };
    customChatModel = 'llama3.1';
    break;
  }

  case 'openrouter': {
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_API_KEY) {
      logger.error(`Specify values for env variables: OPENROUTER_API_KEY`);
      throw new Error(`Specify values for env variables: OPENROUTER_API_KEY`);
    }

    customCredentials = {
      provider: 'openrouter',
      apiKey: OPENROUTER_API_KEY,
    };
    customChatModel = 'openai/gpt-4o';
    break;
  }

  case 'anthropic': {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      logger.error(`Specify values for env variables: ANTHROPIC_API_KEY`);
      throw new Error(`Specify values for env variables: ANTHROPIC_API_KEY`);
    }

    customCredentials = {
      provider: 'anthropic',
      apiKey: ANTHROPIC_API_KEY,
    };
    customChatModel = 'claude-3-5-sonnet-20241022';
    break;
  }

  case 'google': {
    const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

    if (!GOOGLE_API_KEY) {
      logger.error(`Specify values for env variables: GOOGLE_API_KEY`);
      throw new Error(`Specify values for env variables: GOOGLE_API_KEY`);
    }

    customCredentials = {
      provider: 'google',
      apiKey: GOOGLE_API_KEY,
    };
    customChatModel = 'gemini-2.0-flash';
    break;
  }

  case 'fireworks': {
    const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;

    if (!FIREWORKS_API_KEY) {
      logger.error(`Specify values for env variables: FIREWORKS_API_KEY`);
      throw new Error(`Specify values for env variables: FIREWORKS_API_KEY`);
    }

    customCredentials = {
      provider: 'fireworks',
      apiKey: FIREWORKS_API_KEY,
    };
    customChatModel = 'accounts/fireworks/models/llama-v3p2-3b-instruct';
    break;
  }

  case 'azure-openai': {
    const AZURE_OPENAI_KEY = process.env.AZURE_OPENAI_KEY;
    const AZURE_OPENAI_INSTANCE = process.env.AZURE_OPENAI_INSTANCE;
    const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT;
    const AZURE_OPENAI_VERSION = process.env.AZURE_OPENAI_VERSION;

    if (
      !AZURE_OPENAI_KEY ||
      !AZURE_OPENAI_INSTANCE ||
      !AZURE_OPENAI_DEPLOYMENT ||
      !AZURE_OPENAI_VERSION
    ) {
      logger.error(
        `Specify values for env variables: AZURE_OPENAI_KEY, AZURE_OPENAI_INSTANCE, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_VERSION`,
      );
      throw new Error(
        `Specify values for env variables: AZURE_OPENAI_KEY, AZURE_OPENAI_INSTANCE, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_VERSION`,
      );
    }

    customCredentials = {
      provider: 'azure-openai',
      apiKey: AZURE_OPENAI_KEY,
      instanceName: AZURE_OPENAI_INSTANCE,
      deploymentName: AZURE_OPENAI_DEPLOYMENT,
      apiVersion: AZURE_OPENAI_VERSION,
    };
    customChatModel = 'gpt-4o';
    break;
  }
}

export const createChatCompletionInstance = (
  options: ChatCompletionOptions,
  streaming: boolean = true,
): LanguageModelV3 => {
  const rawModel =
    options.model || options.modelName || customChatModel || undefined;
  const selectedModel = rawModel ? normalizeModelId(rawModel) : undefined;

  let credentials: ProviderCredentials;

  if (selectedModel) {
    const modelProvider = getModelProvider(selectedModel);
    if (modelProvider) {
      const providerCredentials = createCredentialsForProvider(modelProvider);
      if (providerCredentials) {
        credentials = providerCredentials;
      } else {
        logger.warn(
          `No credentials found for provider ${modelProvider}, falling back to OpenRouter`,
        );
        credentials = createCredentialsForProvider('openrouter') || {
          provider: 'openai',
          apiKey: process.env.OPENAI_API_KEY!,
        };
      }
    } else {
      logger.warn(
        `Unknown model ${selectedModel}, using environment provider fallback`,
      );
      credentials = customCredentials || {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY!,
      };
    }
  } else {
    credentials = customCredentials || {
      provider: 'openai',
      apiKey: process.env.OPENAI_API_KEY!,
    };
  }

  let temperature = options.temperature;
  if (selectedModel && !supportsTemperature(selectedModel)) {
    if (temperature !== undefined) {
      logger.info(
        { model: selectedModel, temperature },
        'Temperature parameter excluded for model that does not support it',
      );
    }
    temperature = undefined;
  }

  const reasoning = selectedModel ? isReasoningModel(selectedModel) : false;

  return ChatCompletionFactory.createInstance(credentials, {
    model: selectedModel,
    temperature,
    streaming,
    reasoning,
  });
};

// Organization-aware version that checks organization API keys first
export const createChatCompletionInstanceWithOrg = async (
  options: ChatCompletionOptions,
  orgId: string,
  streaming: boolean = true,
): Promise<LanguageModelV3> => {
  const rawModel =
    options.model || options.modelName || customChatModel || undefined;
  const selectedModel = rawModel ? normalizeModelId(rawModel) : undefined;

  let credentials: ProviderCredentials;

  if (selectedModel) {
    const modelProvider = getModelProvider(selectedModel);
    if (modelProvider) {
      const providerCredentials = await createCredentialsForProviderWithOrg(
        modelProvider,
        orgId,
      );
      if (providerCredentials) {
        credentials = providerCredentials;
      } else {
        logger.warn(
          `No credentials found for provider ${modelProvider}, falling back to OpenRouter`,
        );
        const fallbackCredentials = await createCredentialsForProviderWithOrg(
          'openrouter',
          orgId,
        );
        credentials = fallbackCredentials || {
          provider: 'openai',
          apiKey: process.env.OPENAI_API_KEY!,
        };
      }
    } else {
      logger.warn(
        `Unknown model ${selectedModel}, using organization provider fallback`,
      );
      const fallbackCredentials = await createCredentialsForProviderWithOrg(
        'openrouter',
        orgId,
      );
      credentials = fallbackCredentials ||
        customCredentials || {
          provider: 'openai',
          apiKey: process.env.OPENAI_API_KEY!,
        };
    }
  } else {
    const fallbackCredentials = await createCredentialsForProviderWithOrg(
      'openrouter',
      orgId,
    );
    credentials = fallbackCredentials ||
      customCredentials || {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY!,
      };
  }

  let temperature = options.temperature;
  if (selectedModel && !supportsTemperature(selectedModel)) {
    if (temperature !== undefined) {
      logger.info(
        { model: selectedModel, temperature },
        'Temperature parameter excluded for model that does not support it',
      );
    }
    temperature = undefined;
  }

  const reasoning = selectedModel ? isReasoningModel(selectedModel) : false;

  return ChatCompletionFactory.createInstance(credentials, {
    model: selectedModel,
    temperature,
    streaming,
    reasoning,
  });
};

// We use openai embeddings always, independent of the provider
export const createEmbeddingsInstance = ({ apiKey }: { apiKey: string }) => {
  if (!apiKey) {
    throw new Error('Cannot create embeddings instance, apiKey is required');
  }

  return EmbeddingsFactory.createInstance(
    { provider: 'openai', apiKey },
    { model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small' },
    usageTracker,
  );
};

// Content moderation using OpenAI Moderation API directly
// Uses dedicated OPENAI_MODERATION_KEY with fallback to OPENAI_API_KEY
export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
}

export const createModerationInstance = (orgApiKey?: string) => {
  const apiKey =
    orgApiKey ||
    process.env.OPENAI_MODERATION_KEY ||
    process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'Cannot create moderation instance: set OPENAI_MODERATION_KEY or OPENAI_API_KEY',
    );
  }

  const openaiClient = new OpenAI({ apiKey });

  return {
    async invoke({ input }: { input: string }): Promise<{
      results: ModerationResult[];
    }> {
      const response = await openaiClient.moderations.create({
        input,
      });

      return {
        results: response.results.map((r) => ({
          flagged: r.flagged,
          categories: r.categories as unknown as Record<string, boolean>,
        })),
      };
    },
  };
};

export type ModerationInstance = ReturnType<typeof createModerationInstance>;
