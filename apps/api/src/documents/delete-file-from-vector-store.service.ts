import { Injectable, Logger } from '@nestjs/common';
import { GetOrganizationMetadataService } from '../organizations/get-organization-metadata.service.js';
import { getSupabaseVectorStoreClient } from '../vector-store/supabase-vector-store-client-factory.js';

// These were `require()` calls while apps/api was CommonJS — see the note in
// vector-store/qdrant-client.ts. The app is `"type": "module"` now, so the
// import statement resolves to the build we actually want and `require` is
// not defined here at all.
import { QdrantClient } from '@qdrant/js-client-rest';
import { MeiliSearch } from 'meilisearch';

const VECTOR_STORE_TABLE_NAME = 'documents';

/**
 * Ported from apps/web's
 * src/app/api/upload/services/TableService.ts (`deleteFileFromVectorStore`).
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Deviation: the original derives `orgId` from the session
 * (`getOrgIdFromAuthOrThrow`) — this route always has it explicitly from
 * `ApiContext`, so it's a parameter instead. Uses raw vector-store
 * clients directly (matching the original), not the higher-level
 * `VectorStoreClient` abstraction — that abstraction's `deleteDocuments`
 * is oriented around the RAG-retrieval filter shape and would also
 * eagerly `ensureCollection()`, which this "delete on file removal" path
 * neither needs nor wants.
 */
@Injectable()
export class DeleteFileFromVectorStoreService {
  private readonly logger = new Logger(DeleteFileFromVectorStoreService.name);

  constructor(
    private readonly organizationMetadata: GetOrganizationMetadataService,
  ) {}

  async delete(fileId: string, orgId: string): Promise<void> {
    try {
      const orgMetadata = await this.organizationMetadata.get(orgId);
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
        await getSupabaseVectorStoreClient()
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
            must: [{ key: 'metadata.file_id', match: { value: fileId } }],
          },
          wait: true,
        });
      } else {
        this.logger.error(
          'Unrecognized vector store type, cannot delete documents',
          { vectorStoreType, orgId },
        );
      }
    } catch (error) {
      this.logger.error('Error deleting file from vector store', {
        err: error,
      });
      throw error;
    }
  }
}
