import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';

const apiKey = process.env.OPENAI_API_KEY!;
const model = process.env.OPENAI_CHAT_MODEL!;

export const createChatInstance = () => {
  return new ChatOpenAI({
    apiKey,
    model,
    temperature: 1,
    verbose: true,
    streaming: true,
  });
};

export const embeddingModel = new OpenAIEmbeddings({
  apiKey,
});
