import type { BedrockChatFields } from '@langchain/community/chat_models/bedrock';
import type { ChatOpenAIFields } from '@langchain/openai';

export type BaseCompletionConfig = Omit<
  ChatOpenAIFields | BedrockChatFields,
  'credentials' | 'apiKey'
>;
