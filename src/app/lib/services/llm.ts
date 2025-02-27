import { ChatOpenAIFields } from '@langchain/openai';
import { OpenAIModerationChain } from 'langchain/chains';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatCompletionFactory, type ProviderCredentials } from '@/libs/llm';
import { EmbeddingsFactory } from '@/libs/llm/embeddings-factory';
import { OpenAIModerationChainInput } from 'langchain/dist/chains/openai_moderation';
import { usageTracker } from './usage';

const verbose = process.env.NODE_ENV === 'development';

//Todo implement logic to select provider's credentials, ditch logic below after adding provider to the settings
//------------Keep values below as null to use openai and config from settings------------
let customChatModel: string | null = null;
let customCredentials: ProviderCredentials | null = null;

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
//-----------------------------------------------------

//------------Example ollama credentials, uncomment to use------------
//ollama pull llama3.1
// customCredentials = {
//   provider: 'ollama',
//   baseUrl: 'http://127.0.0.1:11434', // localhost will not work, use 127.0.0.1,
// };
// customChatModel = 'llama3.1';
//-----------------------------------------------------

//------------Example openrouter credentials, uncomment to use------------
// customCredentials = {
//   provider: 'openrouter',
//   apiKey: process.env.OPENROUTER_API_KEY!,
// };
// customChatModel = 'meta-llama/llama-3.3-70b-instruct:free';
//-----------------------------------------------------

//------------Example anthropic credentials, uncomment to use------------
// customCredentials = {
//   provider: 'anthropic',
//   apiKey: process.env.ANTHROPIC_API_KEY!,
// };
// customChatModel = 'claude-3-5-sonnet-20241022';
//-----------------------------------------------------

//------------Example google credentials, uncomment to use------------
// customCredentials = {
//   provider: 'google',
//   apiKey: process.env.GOOGLE_API_KEY!,
// };
// customChatModel = 'gemini-1.5-flash';
//-----------------------------------------------------

//------------Example fireworks credentials, uncomment to use------------
// customCredentials = {
//   provider: 'fireworks',
//   apiKey: process.env.FIREWORKS_API_KEY!,
// };
// customChatModel = 'accounts/fireworks/models/llama-v3p2-3b-instruct';
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
