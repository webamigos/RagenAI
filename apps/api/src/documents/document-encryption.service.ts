import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
} from '@ragenai/crypto';

const BATCH_SIZE = 100;

export type EncryptDocumentsResult = {
  success: boolean;
  documentsProcessed: number;
  errors: number;
  errorMessage?: string;
};

/**
 * Ported from apps/web's
 * src/features/documents/services/commands/encrypt-documents-command.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 */
@Injectable()
export class DocumentEncryptionService {
  private readonly logger = new Logger(DocumentEncryptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Encrypt all unencrypted document content for a given organization.
   * Processes in batches. Idempotent — skips already-encrypted documents.
   */
  async encryptDocuments(orgId: string): Promise<EncryptDocumentsResult> {
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
      for (;;) {
        const documents = await this.prisma.client.userDocument.findMany({
          where: {
            organizationId: orgId,
            encryptedDek: null,
            content: { not: '' },
          },
          select: { id: true, content: true },
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

            const result = await this.prisma.client.userDocument.updateMany({
              where: { id: doc.id, organizationId: orgId, encryptedDek: null },
              data: { content: encrypted, encryptedDek },
            });

            if (result.count === 0) {
              continue;
            }

            documentsProcessed++;
            batchProgress++;

            this.logger.log(
              `Encrypted document content (documentId=${doc.id})`,
            );
          } catch (error) {
            errors++;
            this.logger.error(
              `Failed to encrypt document (documentId=${doc.id})`,
              error,
            );
          }
        }

        if (batchProgress === 0) {
          break;
        }
      }

      return { success: errors === 0, documentsProcessed, errors };
    } catch (error) {
      this.logger.error('Failed to run document encryption migration', error);
      return {
        success: false,
        documentsProcessed,
        errors,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Encrypt all unencrypted documents across ALL organizations. Admin-only
   * operation for global migration.
   */
  async encryptAllDocuments(): Promise<EncryptDocumentsResult> {
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
      const orgs = await this.prisma.client.organization.findMany({
        select: { id: true },
      });

      for (const org of orgs) {
        const result = await this.encryptDocuments(org.id);
        totalDocuments += result.documentsProcessed;
        totalErrors += result.errors;
      }

      return {
        success: totalErrors === 0,
        documentsProcessed: totalDocuments,
        errors: totalErrors,
      };
    } catch (error) {
      this.logger.error(
        'Failed to run global document encryption migration',
        error,
      );
      return {
        success: false,
        documentsProcessed: totalDocuments,
        errors: totalErrors + 1,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
