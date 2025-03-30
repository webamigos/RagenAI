import { z } from 'zod';
import { ChatOpenAIFields } from '@langchain/openai';
import { OpenAIModerationChain } from 'langchain/chains';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import {
  modelProvider,
  ChatCompletionFactory,
  type ProviderCredentials,
} from '@/libs/llm';
import { EmbeddingsFactory } from '@/libs/llm/embeddings-factory';
import { OpenAIModerationChainInput } from 'langchain/dist/chains/openai_moderation';
import { usageTracker } from './usage';
import { logger } from '../utils/logger';

const verbose = process.env.NODE_ENV === 'development';

const DEFAULT_MODEL_PROVIDER = modelProvider.parse(
  process.env.DEFAULT_MODEL_PROVIDER
);

// TODO: in future user will select model: Gpt4o, Gemini 2.0, Claude 3.7 etc

//Todo implement logic to select provider's credentials, ditch logic below after adding provider to the settings
//------------Keep values below as null to use openai and config from settings------------
let customChatModel: string | null = null;
let customCredentials: ProviderCredentials | null = null;

switch (DEFAULT_MODEL_PROVIDER) {
  case 'bedrock':
    const AWS_REGION = process.env.AWS_REGION;
    const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
    const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;

    if (!AWS_REGION || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
      logger.error(
        `Specify values for env variables: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY`
      );
      throw new Error(
        `Specify values for env variables: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY`
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

  case 'ollama':
    //ollama pull llama3.1
    const OLLAMA_HOST = process.env.OLLAMA_HOST;

    if (!OLLAMA_HOST) {
      logger.error(`Specify values for env variables: OLLAMA_HOST`);
      throw new Error(`Specify values for env variables: OLLAMA_HOST`);
    }

    customCredentials = {
      provider: 'ollama',
      baseUrl: OLLAMA_HOST, // localhost will not work, use 127.0.0.1,
    };
    customChatModel = 'llama3.1';

    break;

  case 'openrouter':
    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

    if (!OPENROUTER_API_KEY) {
      logger.error(`Specify values for env variables: OPENROUTER_API_KEY`);
      throw new Error(`Specify values for env variables: OPENROUTER_API_KEY`);
    }

    customCredentials = {
      provider: 'openrouter',
      apiKey: OPENROUTER_API_KEY,
    };
    customChatModel = 'meta-llama/llama-3.3-70b-instruct:free';

    break;

  case 'anthropic':
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

  case 'google':
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

  case 'fireworks':
    const FIREWORKS_API_KEY = process.env.FIREWORKS_API_KEY;

    if (!FIREWORKS_API_KEY) {
      logger.error(`Specify values for env variables: FIREWORKS_API_KEY`);
      throw new Error(`Specify values for env variables: FIREWORKS_API_KEY`);
    }

    customCredentials = {
      provider: 'fireworks',
      apiKey: FIREWORKS_API_KEY!,
    };
    customChatModel = 'accounts/fireworks/models/llama-v3p2-3b-instruct';

    break;

  case 'azure-openai':
    //WARNING DON'T USE ENV NAMES AS BELOW, IT WILL CAUSE OPENAI EMBEDDINGS INSTANCE TO CRASH
    //   apiKey: process.env.AZURE_OPENAI_API_KEY!,
    //   instanceName: process.env.AZURE_OPENAI_INSTANCE_NAME!,
    //   deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
    //   apiVersion: process.env.AZURE_OPENAI_API_VERSION!,
    // USE BELOW INSTEAD

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
        `Specify values for env variables: AZURE_OPENAI_KEY, AZURE_OPENAI_INSTANCE, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_VERSION`
      );
      throw new Error(
        `Specify values for env variables: AZURE_OPENAI_KEY, AZURE_OPENAI_INSTANCE, AZURE_OPENAI_DEPLOYMENT, AZURE_OPENAI_VERSION`
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
}

//------------Example azure openai credentials, uncomment to use------------
//WARNING DON'T USE ENV NAMES AS BELOW, IT WILL CAUSE OPENAI EMBEDDINGS INSTANCE TO CRASH
//   apiKey: process.env.AZURE_OPENAI_API_KEY!,
//   instanceName: process.env.AZURE_OPENAI_INSTANCE_NAME!,
//   deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT_NAME!,
//   apiVersion: process.env.AZURE_OPENAI_API_VERSION!,
// USE BELOW INSTEAD
// customCredentials = {
//   provider: 'azure-openai',
//   apiKey: process.env.AZURE_OPENAI_KEY!,
//   instanceName: process.env.AZURE_OPENAI_INSTANCE!,
//   deploymentName: process.env.AZURE_OPENAI_DEPLOYMENT!,
//   apiVersion: process.env.AZURE_OPENAI_VERSION!,
// };
// customChatModel = 'gpt-4o';
//-----------------------------------------------------

export const createChatCompletionInstance = (
  options: ChatOpenAIFields, //todo use BaseCompletionConfig after adding provider to the settings
  streaming: boolean = true
): BaseChatModel => {
  //todo remove this once we have a way to select provider's credentials using settings
  const credentials: ProviderCredentials = customCredentials || {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
  };

  return ChatCompletionFactory.createInstance(credentials, {
    ...options,
    model: customChatModel || options.model,
    verbose,
    streaming,
    callbacks: [
      {
        handleLLMEnd: (output) => {
          usageTracker.incChatCompletionTokens(output);
        },
      },
    ],
  });
};

//We decided to use openai embeddings always, independent of the provider
export const createEmbeddingsInstance = ({ apiKey }: { apiKey: string }) => {
  if (!apiKey) {
    throw new Error('Cannot create embeddings instance, apiKey is required');
  }

  return EmbeddingsFactory.createInstance(
    { provider: 'openai', apiKey },
    { model: 'text-embedding-3-small' },
    usageTracker
  );
};

//We decided to use openai moderation always, independent of the provider
export const createModerationInstance = (
  options: OpenAIModerationChainInput
) => {
  if (!options.apiKey) {
    throw new Error('Cannot create moderation instance, apiKey is required');
  }

  return new OpenAIModerationChain({
    ...options,
    verbose,
  });
};
