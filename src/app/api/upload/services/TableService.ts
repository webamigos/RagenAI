import {
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';
import { VECTOR_STORE_TABLE_NAME } from '@/libs/db/constants/vectorStore';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';

export async function deleteDocument(file_id: string) {
  try {
    setSentryServiceTag('deleteDocument');
    setSentryContext('EXTRA_DATA', {
      file_id,
    });
    await supabaseVectorStoreClient
      .from(VECTOR_STORE_TABLE_NAME)
      .delete()
      .eq('metadata->>file_id', file_id);
  } catch (error) {
    logger.error({ err: error }, 'Error in deleteDocument function');
    throw error;
  }
}
