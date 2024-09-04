import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { createClient } from '@supabase/supabase-js';

const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_CHAT_MODEL;
const sbApiKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sbUrl = process.env.SUPABASE_URL!;

export const createChatInstance = new ChatOpenAI({
  apiKey,
  model,
  temperature: 1,
  verbose: true,
  streaming: true,
});

export const embeddingModel = new OpenAIEmbeddings({
  apiKey,
  model: 'text-embedding-ada-002',
});

export const supeBaseClient = createClient(sbUrl, sbApiKey);
