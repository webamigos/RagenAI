import { supaBaseClient } from '@/app/api/threads/services/ChatService';
import { VECTOR_STORE_TABLE_NAME } from '@/app/constants/vectorStore';
import { logger } from '@/app/lib/utils/logger';

export async function deleteDocument(visitor_id: string, document_id: string) {
  try {
    const deleteEmbeddingsQuery = `
      DELETE FROM ${VECTOR_STORE_TABLE_NAME}
      WHERE metadata->>'document_id' = '${document_id}';
    `;

    const { error: deleteEmbeddingsError } = await supaBaseClient.rpc(
      'execute_sql',
      {
        sql_text: deleteEmbeddingsQuery,
      }
    );

    if (deleteEmbeddingsError) {
      logger.error(
        `Error deleting embeddings for document ${document_id}:`,
        deleteEmbeddingsError
      );
      throw deleteEmbeddingsError;
    }
  } catch (error) {
    logger.error(`Error in deleteDocument function:`, error);
    throw error;
  }
}
