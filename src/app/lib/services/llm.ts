import { ChatCompletionFactory, type ProviderCredentials } from '@/libs/llm';
import { EmbeddingsFactory } from '@/libs/llm/embeddings-factory';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatOpenAIFields } from '@langchain/openai';
import { OpenAIModerationChain } from 'langchain/chains';
import { OpenAIModerationChainInput } from 'langchain/dist/chains/openai_moderation';
import { usageTracker } from './usage';

const verbose = process.env.NODE_ENV === 'development';

//Todo implement logic to select provider's credentials
//------------Keep values below as null to use openai and config from settings------------
let customChatModel: string | null = null;
let customCredentials: ProviderCredentials | null = null;
let customEmbeddingsModel: string | null = null;

//------------Example bedrock credentials, uncomment to use------------
// customCredentials = {
//   provider: 'bedrock',
//   region: process.env.AWS_REGION!,
//   credentials: {
//     accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
//     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
//   },
// };
// customChatModel = 'anthropic.claude-3-haiku-20240307-v1:0';
// customEmbeddingsModel = 'amazon.titan-embed-text-v1';
//-----------------------------------------------------

//------------Example ollama credentials, uncomment to use------------
//ollama pull llama3.1
//ollama pull snowflake-arctic-embed2
// customCredentials = {
//   provider: 'ollama',
//   baseUrl: process.env.OLLAMA_BASE_URL!,
// };
// customChatModel = 'llama3.1';
// customEmbeddingsModel = 'snowflake-arctic-embed2';
//-----------------------------------------------------

export const createChatCompletionInstance = (
  options: ChatOpenAIFields, //todo use BaseCompletionConfig
  streaming: boolean = true
): BaseChatModel => {
  //todo remove this once we have a way to select provider's credentials
  const credentials: ProviderCredentials = customCredentials || {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY!,
  };

  return ChatCompletionFactory.createInstance(credentials, {
    ...options,
    model: customChatModel || options.model,
    verbose,
    streaming,
  });
};

export const createEmbeddingsInstance = ({ apiKey }: { apiKey: string }) => {
  if (!apiKey) {
    throw new Error('Cannot create embeddings instance, apiKey is required');
  }

  //todo remove this once we have a way to select provider's credentials
  const credentials: ProviderCredentials = customCredentials || {
    provider: 'openai',
    apiKey,
  };
  const model = customEmbeddingsModel || 'text-embedding-3-small';

  return EmbeddingsFactory.createInstance(credentials, { model }, usageTracker);
};

//for now moderation always by openai
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
