import { ChatOpenAI } from '@langchain/openai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { createClient } from '@supabase/supabase-js';
import { DatabaseGenerated } from '@/libs/db/supabase-types';

import {
  getModel,
  getOpenaiAPIKey,
  getTemperatureSetting,
} from '@/app/lib/services/settings';
import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';

const apiKey1 = process.env.OPENAI_API_KEY;
const sbApiKey = process.env.SUPABASE_ANON_KEY;
const sbUrl = process.env.SUPABASE_URL;

// eslint-disable-next-line
console.log({ sbApiKey, sbUrl });

export const createChatInstance = async (request: NextRequest) => {
  const { orgId } = getAuth(request);
  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const temperature = await getTemperatureSetting(orgId);
  const modelName = (await getModel(orgId)) ?? '';
  const apiKey = (await getOpenaiAPIKey(orgId)) ?? '';

  return new ChatOpenAI({
    apiKey,
    modelName,
    temperature,
    streaming: true,
    verbose: true, //to be removed on prod
  });
};

export const embeddingModel = new OpenAIEmbeddings({
  apiKey: apiKey1,
  model: 'text-embedding-ada-002',
});

if (!sbUrl || !sbApiKey) {
  throw new Error('supabaseUrl is required.');
}

export const supaBaseClient = createClient<DatabaseGenerated>(sbUrl, sbApiKey);
