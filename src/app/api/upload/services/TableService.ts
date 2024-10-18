import { VECTOR_STORE_TABLE_NAME } from '@/app/constants/vectorStore';
import { logger } from '@/app/lib/utils/logger';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';

export async function deleteDocument(document_id: string) {
  try {
    await supabaseVectorStoreClient
      .from(VECTOR_STORE_TABLE_NAME)
      .delete()
      .eq('metadata->>document_id', document_id);
  } catch (error) {
    logger.error(`Error in deleteDocument function:`, error);
    throw error;
  }
}
