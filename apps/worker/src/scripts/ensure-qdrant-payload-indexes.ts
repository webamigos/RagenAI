/* eslint-disable no-console */
/**
 * Create the payload indexes existing Qdrant collections lack
 * (`PAYLOAD_INDEXES` in `@ragenai/rag-core`; spec
 * 2026-09-29-llm-document-selection, B1).
 *
 *   npx tsx --env-file=.env.local apps/worker/src/scripts/ensure-qdrant-payload-indexes.ts --dry-run
 *   npx tsx --env-file=.env.local apps/worker/src/scripts/ensure-qdrant-payload-indexes.ts
 *
 * The worker does the same for a collection the first time it writes to it
 * after a deploy, so this is for the collections of organizations that are
 * not uploading. Indexes only: no point is read or written, and an index a
 * collection already has is left alone. Point it at an environment's
 * `QDRANT_URL` and `QDRANT_API_KEY`.
 */
import { QdrantClient } from '@qdrant/js-client-rest';

import { ensurePayloadIndexes } from '../services/qdrant.js';
import { qdrantClientOptions } from './document-diagnostics-backfill.js';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const qdrant = new QdrantClient(
    qdrantClientOptions(
      process.env.QDRANT_URL || 'http://localhost:6333',
      process.env.QDRANT_API_KEY,
    ),
  );

  const { collections } = await qdrant.getCollections();
  let changed = 0;
  for (const { name } of collections) {
    const missing = await ensurePayloadIndexes(qdrant, name, { dryRun });
    if (missing.length > 0) {
      changed += 1;
      console.log(
        `${name}: ${dryRun ? 'would create' : 'created'} ${missing.join(', ')}`,
      );
    }
  }
  console.log(
    `${collections.length} collections, ${changed} ${dryRun ? 'would change' : 'changed'}.`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
