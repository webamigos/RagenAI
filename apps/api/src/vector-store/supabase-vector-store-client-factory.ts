import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Ported from ragen-app's src/libs/db/supabaseVectorStoreClient.ts,
 * simplified: the original types the client as `SupabaseClient<Database>`
 * against a 329-line generated schema file
 * (src/libs/db/vectorStoreDatabase.types.ts); the already-ported
 * apps/api/src/vector-store/supabase-client.ts uses a plain (untyped)
 * `SupabaseClient` too, so this follows the same simplification rather than
 * porting that generated types file. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 */
let cachedClient: SupabaseClient | null = null;

export function getSupabaseVectorStoreClient(): SupabaseClient {
  if (!cachedClient) {
    const apiKey = process.env.SUPABASE_ANON_KEY;
    const url = process.env.SUPABASE_API_URL;

    if (!url || !apiKey) {
      throw new Error('Supabase Vector Store apiKey and url is required.');
    }

    cachedClient = createClient(url, apiKey);
  }
  return cachedClient;
}
