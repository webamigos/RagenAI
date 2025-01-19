import {
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { logger } from '@/app/lib/utils/logger';
import { VECTOR_STORE_TABLE_NAME } from '@/libs/db/constants/vectorStore';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { auth } from '@clerk/nextjs/server';
import { getOrganizationMetadata } from '@/app/actions';
import { QdrantClient } from '@qdrant/js-client-rest';

export async function deleteDocument(file_id: string) {
  try {
    setSentryServiceTag('deleteDocument');
    setSentryContext('EXTRA_DATA', {
      file_id,
    });

    const { orgId } = auth();
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
        throw new Error('Couldnt delete from Qdrant, collection not found');
      }

      await qdrantClient.delete(orgId, {
        wait: true,
        filter: {
          must: [
            {
              key: 'metadata.file_id',
              match: { value: file_id },
            },
          ],
        },
      });
    } else {
      await supabaseVectorStoreClient
        .from(VECTOR_STORE_TABLE_NAME)
        .delete()
        .eq('metadata->>file_id', file_id);
    }
  } catch (error) {
    logger.error({ err: error }, 'Error in deleteDocument function');
    throw error;
  }
}
