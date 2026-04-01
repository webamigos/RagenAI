import { logger } from '@/app/lib/utils/logger';
import { VECTOR_STORE_TABLE_NAME } from '@/libs/db/constants/vectorStore';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getOrganizationMetadata } from '@/app/actions';
import { MeiliSearch } from 'meilisearch';
import { QdrantClient } from '@qdrant/js-client-rest';
import { type UserFile } from '@/generated/prisma/client';

export async function deleteFileFromVectorStore(fileId: UserFile['id']) {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    if (!orgId) {
      throw new Error('Invalid organization!');
    }

    const orgMetadata = await getOrganizationMetadata(orgId);
    const vectorStoreType = orgMetadata.vectorStore;

    if (vectorStoreType === 'meilisearch') {
      const client = new MeiliSearch({
        host: process.env.MEILISEARCH_URL!,
        apiKey: process.env.MEILISEARCH_MASTER_KEY,
      });

      const index = client.index(orgId);
      const task = await index.deleteDocuments({
        filter: `metadata.file_id = '${fileId}'`,
      });
      await client.waitForTask(task.taskUid);
    } else if (vectorStoreType === 'supabase') {
      await supabaseVectorStoreClient
        .from(VECTOR_STORE_TABLE_NAME)
        .delete()
        .eq('metadata->>file_id', fileId);
    } else {
      // Default: Qdrant
      const client = new QdrantClient({
        url: process.env.QDRANT_URL || 'http://localhost:6333',
        apiKey: process.env.QDRANT_API_KEY,
      });

      await client.delete(orgId, {
        filter: {
          must: [
            {
              key: 'metadata.file_id',
              match: { value: fileId },
            },
          ],
        },
        wait: true,
      });
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in deleteDocument function');
    throw error;
  }
}
