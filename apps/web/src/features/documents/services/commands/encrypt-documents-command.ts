'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
} from '@/libs/crypto/thread-encryption';

const BATCH_SIZE = 100;

export type EncryptDocumentsResult = {
  success: boolean;
  documentsProcessed: number;
  errors: number;
  errorMessage?: string;
};

/**
 * Encrypt all unencrypted document content for a given organization.
 * Processes in batches. Idempotent — skips already-encrypted documents.
 */
export async function encryptDocumentsCommand(
  orgId: string,
): Promise<EncryptDocumentsResult> {
  if (!isEncryptionEnabled()) {
    return {
      success: false,
      documentsProcessed: 0,
      errors: 0,
      errorMessage:
        'Encryption is not enabled (no encryption provider configured)',
    };
  }

  let documentsProcessed = 0;
  let errors = 0;

  try {
    while (true) {
      const documents = await db.userDocument.findMany({
        where: {
          organizationId: orgId,
          encryptedDek: null,
          content: { not: '' },
        },
        select: {
          id: true,
          content: true,
        },
        take: BATCH_SIZE,
        orderBy: { id: 'asc' },
      });

      if (documents.length === 0) {
        break;
      }

      let batchProgress = 0;

      for (const doc of documents) {
        try {
          const { plaintextDek, encryptedDek } = await generateThreadKey();
          const encrypted = encryptContent(doc.content, plaintextDek);

          const result = await db.userDocument.updateMany({
            where: {
              id: doc.id,
              organizationId: orgId,
              encryptedDek: null,
            },
            data: {
              content: encrypted,
              encryptedDek,
            },
          });

          if (result.count === 0) {
            continue;
          }

          documentsProcessed++;
          batchProgress++;

          logger.info({ documentId: doc.id }, 'Encrypted document content');
        } catch (error) {
          errors++;
          logger.error(
            { err: error, documentId: doc.id },
            'Failed to encrypt document',
          );
        }
      }

      if (batchProgress === 0) {
        break;
      }
    }

    return {
      success: errors === 0,
      documentsProcessed,
      errors,
    };
  } catch (error) {
    logger.error({ err: error }, 'Failed to run document encryption migration');
    return {
      success: false,
      documentsProcessed,
      errors,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Encrypt all unencrypted documents across ALL organizations.
 * Admin-only operation for global migration.
 */
export async function encryptAllDocumentsCommand(): Promise<EncryptDocumentsResult> {
  if (!isEncryptionEnabled()) {
    return {
      success: false,
      documentsProcessed: 0,
      errors: 0,
      errorMessage:
        'Encryption is not enabled (no encryption provider configured)',
    };
  }

  let totalDocuments = 0;
  let totalErrors = 0;

  try {
    const orgs = await db.organization.findMany({
      select: { id: true },
    });

    for (const org of orgs) {
      const result = await encryptDocumentsCommand(org.id);
      totalDocuments += result.documentsProcessed;
      totalErrors += result.errors;
    }

    return {
      success: totalErrors === 0,
      documentsProcessed: totalDocuments,
      errors: totalErrors,
    };
  } catch (error) {
    logger.error(
      { err: error },
      'Failed to run global document encryption migration',
    );
    return {
      success: false,
      documentsProcessed: totalDocuments,
      errors: totalErrors + 1,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
