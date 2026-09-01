import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { type Database } from './vectorStoreDatabase.types';

let _client: SupabaseClient<Database> | null = null;

export function getSupabaseVectorStoreClient(): SupabaseClient<Database> {
  if (!_client) {
    const apiKey = process.env.SUPABASE_ANON_KEY;
    const url = process.env.SUPABASE_API_URL;

    if (!url || !apiKey) {
      throw new Error('Supabase Vector Store apiKey and url is required.');
    }

    _client = createClient<Database>(url, apiKey);
  }
  return _client;
}

/** @deprecated Use getSupabaseVectorStoreClient() instead */
export const supabaseVectorStoreClient = new Proxy(
  {} as SupabaseClient<Database>,
  {
    get(_, prop) {
      return (getSupabaseVectorStoreClient() as any)[prop];
    },
  },
);
