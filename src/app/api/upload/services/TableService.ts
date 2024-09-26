import { supaBaseClient } from '@/app/api/threads/services/ChatService';
import { logger } from '@/app/lib/utils/logger';

export async function deleteDocument(visitor_id: string, document_id: string) {
  try {
    const userTableName = `document_${visitor_id}`;

    const deleteEmbeddingsQuery = `
      DELETE FROM ${userTableName}
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
