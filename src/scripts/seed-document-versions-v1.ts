/* eslint-disable no-console */
/**
 * One-time migration script to seed DocumentVersion v1 for all existing documents.
 *
 * Run with: npx tsx src/scripts/seed-document-versions-v1.ts
 *
 * This script:
 * 1. Queries all existing UserDocuments
 * 2. For each document without an existing version, creates DocumentVersion v1
 * 3. Marks that version as active, with UPLOAD change type
 * 4. Skips documents that already have versions (idempotent)
 */

import db from '@ragenai/prisma-client';

async function seedDocumentVersionsV1() {
  console.log('Starting DocumentVersion v1 seed migration...\n');

  // Get all documents with their associated files
  const documents = await db.userDocument.findMany({
    select: {
      id: true,
      organizationId: true,
      content: true,
      title: true,
      file: {
        select: {
          metadata: true,
        },
      },
    },
  });

  console.log(`Found ${documents.length} documents to process\n`);

  let created = 0;
  let skipped = 0;
  const errors: Array<{ docId: string; error: string }> = [];

  for (const doc of documents) {
    try {
      // Check if version already exists
      const existing = await db.documentVersion.findFirst({
        where: { documentId: doc.id },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Extract ragScore from file metadata if available
      const metadata = doc.file?.metadata as Record<string, unknown> | null;
      const ragScore = metadata?.ragScore ?? null;

      // Create v1 for this document
      await db.documentVersion.create({
        data: {
          documentId: doc.id,
          versionNumber: 1,
          content: doc.content,
          title: doc.title,
          changeType: 'UPLOAD',
          authorId: null,
          ragScore: ragScore ?? undefined,
          isActive: true,
          comment: 'Initial version (migrated)',
        },
      });

      created++;

      if (created % 100 === 0) {
        console.log(`  Progress: ${created} versions created...`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      errors.push({
        docId: doc.id,
        error: errorMsg,
      });
      console.error(`  Error creating version for doc ${doc.id}: ${errorMsg}`);
    }
  }

  console.log('\n=== Migration Summary ===');
  console.log(`Created:  ${created} new DocumentVersion records`);
  console.log(`Skipped:  ${skipped} documents (already have versions)`);
  console.log(`Errors:   ${errors.length} documents failed`);

  if (errors.length > 0) {
    console.log('\nFailed documents:');
    errors.forEach(({ docId, error }) => {
      console.log(`  - ${docId}: ${error}`);
    });
  }

  console.log('\nDocumentVersion v1 seed migration complete!');
}

seedDocumentVersionsV1()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
