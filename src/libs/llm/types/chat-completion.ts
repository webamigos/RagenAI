import type { BedrockChatFields } from '@langchain/community/chat_models/bedrock';
import type { ChatOpenAIFields } from '@langchain/openai';

export type BaseCompletionConfig = Omit<
  ChatOpenAIFields | BedrockChatFields,
  'credentials' | 'apiKey'
>;

export type ChatCompletionProvider = 'bedrock' | 'openai';

export type BaseProviderCredentials = {
  provider: ChatCompletionProvider;
};

export type OpenAICredentials = BaseProviderCredentials & {
  provider: 'openai';
  apiKey: string;
};

export type BedrockCredentials = BaseProviderCredentials & {
  provider: 'bedrock';
  region: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

export type ProviderCredentials = OpenAICredentials | BedrockCredentials;
