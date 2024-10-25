import { logger } from '@/app/lib/utils/logger';
import { VECTOR_STORE_TABLE_NAME } from '@/libs/db/constants/vectorStore';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';

export async function deleteDocument(file_id: string) {
  try {
    await supabaseVectorStoreClient
      .from(VECTOR_STORE_TABLE_NAME)
      .delete()
      .eq('metadata->>file_id', file_id);
  } catch (error) {
    logger.error(`Error in deleteDocument function:`, error);
    throw error;
  }
}
