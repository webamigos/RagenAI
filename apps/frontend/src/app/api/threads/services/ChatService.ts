import { ChatOpenAI } from '@langchain/openai';

export const createChatInstance = (apiKey: string, model: string) => {
  return new ChatOpenAI({
    apiKey,
    model,
    temperature: 1,
    verbose: true,
    streaming: true,
  });
};
