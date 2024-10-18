import { ChatOpenAI, ChatOpenAIFields } from '@langchain/openai';
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
import { OpenAIModerationChain } from 'langchain/chains';

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
    verbose: true,
    streaming: true,
  });
};

export const createChatInstanceV2 = async (
  orgId: string,
  options: Omit<ChatOpenAIFields, 'apiKey'>
) => {
  const apiKey = await getOpenaiAPIKey(orgId);

  if (!apiKey) {
    throw new Error('OpenAI API key is required.');
  }

  return new ChatOpenAI({
    apiKey,
    verbose: process.env.NODE_ENV === 'development',
    streaming: true,
    ...options,
  });
};

export const createModerationInstance = async (orgId: string) => {
  const apiKey = await getOpenaiAPIKey(orgId);
  if (!apiKey) {
    throw new Error('OpenAI API key is required.');
  }

  return new OpenAIModerationChain({
    apiKey,
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
