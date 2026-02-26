import { createClient } from '@supabase/supabase-js';
import { type Database } from './vectorStoreDatabase.types';

const apiKey = process.env.SUPABASE_ANON_KEY;
const url = process.env.SUPABASE_API_URL;

if (!url || !apiKey) {
  throw new Error('Supabase Vector Store apiKey and url is required.');
}

export const supabaseVectorStoreClient = createClient<Database>(url, apiKey);
