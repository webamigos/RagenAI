/* eslint-disable no-console */
/**
 * One-off backfill: give every existing document a version 1.
 *
 * Run with: npx tsx src/scripts/seed-document-versions-v1.ts
 *
 * Idempotent — a document that already has any version is skipped, so this can
 * be re-run after a partial failure or alongside ongoing ingest.
 */

import db from '@ragenai/prisma-client';

/**
 * Paged rather than loaded whole: `content` is the entire document text, so a
 * single findMany over a large knowledge base is the one query here that could
 * exhaust memory.
 */
const BATCH_SIZE = 200;

type Counters = { created: number; skipped: number };

async function seedBatch(
  documents: Array<{
    id: string;
    organizationId: string;
    content: string;
    title: string;
    file: { metadata: unknown } | null;
  }>,
  counters: Counters,
  errors: Array<{ docId: string; error: string }>,
): Promise<void> {
  for (const doc of documents) {
    try {
      const existing = await db.documentVersion.findFirst({
        where: { documentId: doc.id, organizationId: doc.organizationId },
        select: { id: true },
      });

      if (existing) {
        counters.skipped++;
        continue;
      }

      // The ingest score already lives on the file; carrying it over means the
      // history shows a score for v1 instead of a blank.
      const metadata = doc.file?.metadata as Record<string, unknown> | null;
      const ragScore = metadata?.ragScore ?? undefined;

      await db.documentVersion.create({
        data: {
          documentId: doc.id,
          organizationId: doc.organizationId,
          versionNumber: 1,
          content: doc.content,
          title: doc.title,
          changeType: 'UPLOAD',
          authorId: null,
          ragScore,
          isActive: true,
          comment: 'Initial version (migrated)',
        },
      });

      counters.created++;
    } catch (error) {
      errors.push({
        docId: doc.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

async function seedDocumentVersionsV1() {
  console.log('Seeding DocumentVersion v1 for existing documents...\n');

  const counters: Counters = { created: 0, skipped: 0 };
  const errors: Array<{ docId: string; error: string }> = [];
  let cursor: string | undefined;
  let processed = 0;

  for (;;) {
    const documents = await db.userDocument.findMany({
      take: BATCH_SIZE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        organizationId: true,
        content: true,
        title: true,
        file: { select: { metadata: true } },
      },
    });

    if (documents.length === 0) {
      break;
    }

    await seedBatch(documents, counters, errors);

    processed += documents.length;
    cursor = documents[documents.length - 1].id;
    console.log(
      `  ${processed} documents processed (${counters.created} created, ${counters.skipped} skipped)`,
    );
  }

  console.log('\n=== Summary ===');
  console.log(`Created:  ${counters.created}`);
  console.log(`Skipped:  ${counters.skipped} (already had versions)`);
  console.log(`Errors:   ${errors.length}`);

  if (errors.length > 0) {
    console.log('\nFailed documents:');
    errors.forEach(({ docId, error }) => console.log(`  - ${docId}: ${error}`));
    // A partial backfill leaves documents without history; the exit code has to
    // say so or a deploy step would treat this as done.
    process.exitCode = 1;
  }
}

seedDocumentVersionsV1()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
