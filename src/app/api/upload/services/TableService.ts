import { logger } from '@/app/lib/utils/logger';
import { VECTOR_STORE_TABLE_NAME } from '@/libs/db/constants/vectorStore';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { getOrganizationMetadata } from '@/app/actions';
import { QdrantClient } from '@qdrant/js-client-rest';
import { UserFile } from '@/generated/prisma/client';

export async function deleteFileFromVectorStore(fileId: UserFile['id']) {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    if (!orgId) {
      throw new Error('Invalid organization!');
    }

    const orgMetadata = await getOrganizationMetadata(orgId);
    const vectorStoreType = orgMetadata.privateMetadata?.vector_store;

    if (vectorStoreType === 'qdrant') {
      const qdrantClient = new QdrantClient({
        url: process.env.QDRANT_URL,
        apiKey: process.env.QDRANT_API_KEY,
      });

      const collectionInfo = await qdrantClient.getCollection(orgId);
      if (!collectionInfo) {
        throw new Error('Could not delete from Qdrant, collection not found');
      }

      await qdrantClient.delete(orgId, {
        wait: true,
        filter: {
          must: [
            {
              key: 'metadata.file_id',
              match: { value: fileId },
            },
          ],
        },
      });
    } else {
      await supabaseVectorStoreClient
        .from(VECTOR_STORE_TABLE_NAME)
        .delete()
        .eq('metadata->>file_id', fileId);
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in deleteDocument function');
    throw error;
  }
}
