/* eslint-disable no-console */
/**
 * One-time migration script to backfill `accessible_by` metadata
 * on all existing vector store documents (Qdrant or Meilisearch).
 *
 * Run with: npx tsx src/scripts/backfill-accessible-by.ts
 *
 * This script:
 * 1. Queries all organizations
 * 2. For each org's vector store, gets all documents
 * 3. Computes accessible_by based on current DB state
 * 4. Updates documents with the new metadata
 *
 * Legacy files (no owner) get ["org:<orgId>"] — accessible to all org members.
 */

import db from '@ragenai/prisma-client';
import { QdrantClient } from '@qdrant/js-client-rest';
import { MeiliSearch } from 'meilisearch';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const MEILISEARCH_URL = process.env.MEILISEARCH_URL || 'http://localhost:7700';
const MEILISEARCH_KEY = process.env.MEILISEARCH_MASTER_KEY;
const BATCH_SIZE = 100;

function buildFileAccessMap(
  files: Array<{
    id: string;
    ownerId: string | null;
    folder: { teamId: string | null } | null;
    permissions: Array<{ granteeType: string; granteeId: string }>;
  }>,
  orgId: string,
): Map<string, string[]> {
  const fileAccessMap = new Map<string, string[]>();
  for (const file of files) {
    if (!file.ownerId) {
      fileAccessMap.set(file.id, [`org:${orgId}`]);
    } else {
      const principals = new Set<string>();
      principals.add(`user:${file.ownerId}`);
      if (file.folder?.teamId) {
        principals.add(`team:${file.folder.teamId}`);
      }
      for (const perm of file.permissions) {
        principals.add(`${perm.granteeType}:${perm.granteeId}`);
      }
      fileAccessMap.set(file.id, Array.from(principals));
    }
  }
  return fileAccessMap;
}

async function backfillQdrant(
  orgId: string,
  fileAccessMap: Map<string, string[]>,
): Promise<number> {
  const qdrant = new QdrantClient({ url: QDRANT_URL, apiKey: QDRANT_API_KEY });

  // Check if collection exists
  const exists = await qdrant.collectionExists(orgId);
  if (!exists.exists) {
    console.log(`  No Qdrant collection found for org ${orgId}`);
    return 0;
  }

  const info = await qdrant.getCollection(orgId);
  console.log(`  Collection has ${info.points_count} points`);

  if (info.points_count === 0) {
    return 0;
  }

  let processed = 0;
  let offset: string | number | undefined = undefined;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await qdrant.scroll(orgId, {
      limit: BATCH_SIZE,
      offset: offset ?? undefined,
      with_payload: true,
      with_vector: false,
    });

    if (result.points.length === 0) {
      break;
    }

    for (const point of result.points) {
      const metadata = (point.payload?.metadata || {}) as Record<
        string,
        unknown
      >;
      const fileId = metadata.file_id as string | undefined;
      if (!fileId) {
        continue;
      }

      const accessibleBy = fileAccessMap.get(fileId) || [`org:${orgId}`];

      await qdrant.setPayload(orgId, {
        payload: {
          metadata: { ...metadata, accessible_by: accessibleBy },
        },
        points: [point.id],
        wait: true,
      });
      processed++;
    }

    offset = result.next_page_offset ?? undefined;
    if (!offset) {
      break;
    }
  }

  return processed;
}

async function backfillMeilisearch(
  orgId: string,
  fileAccessMap: Map<string, string[]>,
): Promise<number> {
  const client = new MeiliSearch({
    host: MEILISEARCH_URL,
    apiKey: MEILISEARCH_KEY,
  });

  try {
    const index = client.index(orgId);
    const stats = await index.getStats();
    console.log(`  Index has ${stats.numberOfDocuments} documents`);

    if (stats.numberOfDocuments === 0) {
      return 0;
    }

    let offset = 0;
    let processed = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const results = await index.getDocuments({
        offset,
        limit: BATCH_SIZE,
        fields: ['id', 'metadata'],
      });

      if (results.results.length === 0) {
        break;
      }

      const updates = results.results
        .filter(
          (doc: Record<string, unknown>) =>
            doc.metadata &&
            typeof doc.metadata === 'object' &&
            'file_id' in (doc.metadata as Record<string, unknown>),
        )
        .map((doc: Record<string, unknown>) => {
          const metadata = doc.metadata as Record<string, unknown>;
          const fileId = metadata.file_id as string;
          const accessibleBy = fileAccessMap.get(fileId) || [`org:${orgId}`];
          return {
            ...doc,
            metadata: {
              ...metadata,
              accessible_by: accessibleBy,
            },
          };
        });

      if (updates.length > 0) {
        const task = await index.updateDocuments(updates);
        await client.waitForTask(task.taskUid);
        processed += updates.length;
      }

      offset += BATCH_SIZE;
      if (results.results.length < BATCH_SIZE) {
        break;
      }
    }

    return processed;
  } catch (error) {
    if (error instanceof Error && error.message.includes('not found')) {
      console.log(`  No Meilisearch index found for org ${orgId}`);
      return 0;
    }
    throw error;
  }
}

async function main() {
  console.log('Starting accessible_by backfill...');

  const organizations = await db.organization.findMany({
    select: { id: true, name: true, vectorStore: true },
  });

  console.log(`Found ${organizations.length} organizations`);

  for (const org of organizations) {
    console.log(`\nProcessing org: ${org.name} (${org.id})`);

    // Build file access map from DB
    const files = await db.userFile.findMany({
      where: { organizationId: org.id },
      select: {
        id: true,
        ownerId: true,
        folderId: true,
        folder: {
          select: { teamId: true },
        },
        permissions: {
          select: { granteeType: true, granteeId: true },
        },
      },
    });

    const fileAccessMap = buildFileAccessMap(files, org.id);

    try {
      let processed: number;

      if (org.vectorStore === 'meilisearch') {
        processed = await backfillMeilisearch(org.id, fileAccessMap);
      } else if (org.vectorStore === 'supabase') {
        console.log(`  Skipping org ${org.name} — uses supabase`);
        continue;
      } else {
        // Default: Qdrant
        processed = await backfillQdrant(org.id, fileAccessMap);
      }

      console.log(`  Updated ${processed} documents`);
    } catch (error) {
      console.error(`  Error processing org ${org.id}:`, error);
    }
  }

  console.log('\nBackfill complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
