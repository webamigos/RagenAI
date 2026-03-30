/* eslint-disable no-console */
/**
 * One-time migration script to backfill `accessible_by` metadata
 * on all existing Meilisearch documents.
 *
 * Run with: npx tsx src/scripts/backfill-accessible-by.ts
 *
 * This script:
 * 1. Queries all organizations
 * 2. For each org's Meilisearch index, gets all documents
 * 3. Computes accessible_by based on current DB state
 * 4. Updates documents in Meilisearch with the new metadata
 *
 * Legacy files (no owner) get ["org:<orgId>"] — accessible to all org members.
 */

import db from '@ragenai/prisma-client';
import { MeiliSearch } from 'meilisearch';

const MEILISEARCH_URL = process.env.MEILISEARCH_URL || 'http://localhost:7700';
const MEILISEARCH_KEY = process.env.MEILISEARCH_MASTER_KEY;
const BATCH_SIZE = 1000;

async function main() {
  console.log('Starting accessible_by backfill...');
  console.log(`Meilisearch URL: ${MEILISEARCH_URL}`);

  const client = new MeiliSearch({
    host: MEILISEARCH_URL,
    apiKey: MEILISEARCH_KEY,
  });

  // Get all organizations
  const organizations = await db.organization.findMany({
    select: { id: true, name: true, vectorStore: true },
  });

  console.log(`Found ${organizations.length} organizations`);

  for (const org of organizations) {
    if (org.vectorStore !== 'meilisearch' && org.vectorStore !== null) {
      console.log(
        `Skipping org ${org.name} (${org.id}) — uses ${org.vectorStore}`,
      );
      continue;
    }

    console.log(`\nProcessing org: ${org.name} (${org.id})`);

    // Check if index exists
    try {
      const index = client.index(org.id);
      const stats = await index.getStats();
      console.log(`  Index has ${stats.numberOfDocuments} documents`);

      if (stats.numberOfDocuments === 0) {
        continue;
      }

      // Build a map of file_id -> accessible_by
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

      const fileAccessMap = new Map<string, string[]>();
      for (const file of files) {
        if (!file.ownerId) {
          // Legacy file — org-wide
          fileAccessMap.set(file.id, [`org:${org.id}`]);
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

      // Process documents in batches
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
            const accessibleBy = fileAccessMap.get(fileId) || [`org:${org.id}`];
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

      console.log(`  Updated ${processed} documents`);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        console.log(`  No Meilisearch index found for org ${org.id}`);
      } else {
        console.error(`  Error processing org ${org.id}:`, error);
      }
    }
  }

  console.log('\nBackfill complete!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
