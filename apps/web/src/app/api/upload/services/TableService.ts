import { logger } from '@/app/lib/utils/logger';
import { VECTOR_STORE_TABLE_NAME } from '@/libs/db/constants/vectorStore';
import { supabaseVectorStoreClient } from '@/libs/db/supabaseVectorStoreClient';
import { getOrganizationMetadataQuery as getOrganizationMetadata } from '@/features/organizations/services/queries/get-organization-metadata-query';
import { MeiliSearch } from 'meilisearch';
import { QdrantClient } from '@qdrant/js-client-rest';
import { type UserFile } from '@/generated/prisma/client';

/**
 * Remove every vector belonging to a file.
 *
 * **`organizationId` is a parameter, not a session read.** It used to call
 * `getOrgIdFromAuthOrThrow()`, which works only where a Better Auth session
 * exists. The internal `/api/v1/files/[fileId]` route — the one `apps/api`
 * calls for the public `DELETE /v1/files/:id` — authenticates on a shared
 * secret and has no session, so the lookup threw, the caller's `catch` logged
 * a warning, and the delete reported success with every point still in the
 * collection. The document stayed retrievable and answerable after the user
 * had deleted it; eight files deleted that way left all 34 of their chunks
 * behind.
 *
 * This is the same correction `update-document-command.ts` already carries for
 * `deleteDocumentFromDbCommand`, and for the same reason: this is internal
 * cleanup after the delete was authorized upstream, every caller already holds
 * a validated org id, and a session read here could only ever fail — silently.
 */
export async function deleteFileFromVectorStore(
  fileId: UserFile['id'],
  organizationId: string,
) {
  try {
    const orgId = organizationId;
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
        filter: `metadata.file_id = ${fileId}`,
      });
      await client.waitForTask(task.taskUid);
    } else if (vectorStoreType === 'supabase') {
      await supabaseVectorStoreClient
        .from(VECTOR_STORE_TABLE_NAME)
        .delete()
        .eq('metadata->>file_id', String(fileId));
    } else if (!vectorStoreType || vectorStoreType === 'qdrant') {
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
    } else {
      logger.error(
        { vectorStoreType, orgId },
        'Unrecognized vector store type, cannot delete documents',
      );
    }
  } catch (error) {
    logger.error(
      { err: error, fileId, orgId: organizationId },
      'Failed to delete a file\u2019s vectors — its content stays retrievable until this succeeds',
    );
    throw error;
  }
}
