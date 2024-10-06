import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { createClient } from '@supabase/supabase-js';

import { DatabaseGenerated } from '@/libs/db/supabase-types';
import {
  getModelSetting,
  getTemperatureSetting,
} from '@/app/lib/services/settings';
// import { fetchApiKey } from '@/app/lib/services/api';

const apiKey = process.env.OPENAI_API_KEY;
const sbApiKey = process.env.SUPABASE_ANON_KEY;
const sbUrl = process.env.SUPABASE_URL;

// eslint-disable-next-line
console.log({ sbApiKey, sbUrl });

export const createChatInstance = async () => {
  const temperature = await getTemperatureSetting();
  const modelName = await getModelSetting();
  // const { data } = await fetchApiKey();
  // const apiKey = data.apiKey;

  return new ChatOpenAI({
    apiKey,
    modelName,
    temperature,
    verbose: true,
    streaming: true,
  });
};

export const embeddingModel = new OpenAIEmbeddings({
  apiKey,
  model: 'text-embedding-ada-002',
});

if (!sbUrl || !sbApiKey) {
  throw new Error('supabaseUrl is required.');
}

export const supaBaseClient = createClient<DatabaseGenerated>(sbUrl, sbApiKey);
