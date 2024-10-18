import { createClient } from '@supabase/supabase-js';

const apiKey = process.env.SUPABASE_ANON_KEY;
const url = process.env.SUPABASE_URL;

if (!url || !apiKey) {
  throw new Error('Supabase Vector Store apiKey and url is required.');
}

//todo type is missing
export const supabaseVectorStoreClient = createClient<any>(url, apiKey);
