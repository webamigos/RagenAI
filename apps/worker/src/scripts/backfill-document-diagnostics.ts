/* eslint-disable no-console */
/**
 * Write `metadata.diagnostics` for files indexed before ingest computed them
 * (spec 2026-09-26-rag-readiness-score-review, Data model and D4).
 *
 *   # what it would write, per file type — reads only
 *   npx tsx --env-file=.env.local apps/worker/src/scripts/backfill-document-diagnostics.ts \
 *     --org <organizationId> --dry-run
 *   # write it
 *   npx tsx --env-file=.env.local apps/worker/src/scripts/backfill-document-diagnostics.ts \
 *     --org <organizationId>
 *
 * Reads each indexed file's chunks back from Qdrant, runs the same checks
 * ingest runs (`computeDocumentDiagnostics`), and merges the result into the
 * file's metadata. No model call, no re-embedding, no change to the index:
 * the chunks are read, never written. A file that already has diagnostics is
 * skipped unless `--force`, because ingest's own report knows its parser and
 * this one does not (`parser: 'unknown'`: no fallback or section-path check).
 *
 * It prints a table of findings per file type — the numbers D4 compares with
 * C4's corpora before `documentDiagnostics` becomes the default.
 *
 * Point it at an environment's `DATABASE_URL`, `QDRANT_URL` and
 * `QDRANT_API_KEY`. Run it with `--dry-run` first.
 */
import { QdrantClient } from '@qdrant/js-client-rest';

import { db } from '../services/db/db.js';
import { getPrisma } from '../services/db/prisma.js';
import { computeDocumentDiagnostics } from '../services/document-diagnostics.js';
import type { FileType } from '../types/UserFile.js';
import {
  chunksFromPoints,
  parseBackfillArgs,
  renderSummary,
  summariseByType,
  type BackfillRow,
  type StoredPoint,
} from './document-diagnostics-backfill.js';

const PAGE = 256;
/** Files read from the database at a time, so `--limit 1` reads one page. */
const FILE_PAGE = 100;

async function pointsOf(
  qdrant: QdrantClient,
  orgId: string,
  fileId: string,
): Promise<StoredPoint[]> {
  const points: StoredPoint[] = [];
  let offset: string | number | undefined;
  do {
    const page = await qdrant.scroll(orgId, {
      filter: { must: [{ key: 'metadata.file_id', match: { value: fileId } }] },
      limit: PAGE,
      offset,
      with_payload: true,
      with_vector: false,
    });
    points.push(...page.points);
    const next = page.next_page_offset;
    offset =
      typeof next === 'string' || typeof next === 'number' ? next : undefined;
  } while (offset !== undefined);
  return points;
}

function hasDiagnostics(metadata: unknown): boolean {
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    (metadata as Record<string, unknown>).diagnostics != null
  );
}

async function main() {
  // Validated before any read, let alone a write.
  const { orgId, dryRun, force, limit } = parseBackfillArgs(
    process.argv.slice(2),
  );

  const qdrant = new QdrantClient({
    url: process.env.QDRANT_URL || 'http://localhost:6333',
    apiKey: process.env.QDRANT_API_KEY,
  });
  if (!(await qdrant.collectionExists(orgId)).exists) {
    console.log(`No collection for organization ${orgId}; nothing is indexed.`);
    return;
  }

  const rows: BackfillRow[] = [];
  let skipped = 0;
  let empty = 0;
  let cursor: string | undefined;

  // Page by page, so a bounded trial reads about as many rows as it reports
  // on rather than the whole organization. Ordered by creation, with the id
  // as the tie-break the cursor needs.
  pages: while (rows.length < limit) {
    // Indexed files only: a staged, withdrawn or failed file has no chunks
    // retrieval holds, and ingest writes no findings for it either.
    const files = await getPrisma().userFile.findMany({
      where: { organizationId: orgId, embeddingStatus: 'COMPLETED' },
      select: { id: true, fileType: true, metadata: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: FILE_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (files.length === 0) {
      break;
    }
    cursor = files[files.length - 1].id;

    for (const file of files) {
      if (rows.length >= limit) {
        break pages;
      }
      if (!force && hasDiagnostics(file.metadata)) {
        skipped += 1;
        continue;
      }
      const chunks = chunksFromPoints(await pointsOf(qdrant, orgId, file.id));
      if (chunks.length === 0) {
        empty += 1;
        continue;
      }
      const diagnostics = computeDocumentDiagnostics(
        chunks,
        file.fileType as FileType,
        { parser: 'unknown', doclingExpected: false },
      );
      rows.push({ fileId: file.id, fileType: file.fileType, diagnostics });
      if (!dryRun) {
        await db.mergeFileMetadata({
          where: { fileId: file.id, orgId },
          patch: { diagnostics },
        });
      }
    }
    if (files.length < FILE_PAGE) {
      break;
    }
  }

  console.log(
    `${dryRun ? 'Would write' : 'Wrote'} diagnostics for ${rows.length} files; ` +
      `${skipped} already had them, ${empty} have no chunks in Qdrant.\n`,
  );
  console.log(renderSummary(summariseByType(rows)));
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => getPrisma().$disconnect());
