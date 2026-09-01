import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
} from '../crypto/thread-encryption.js';

const BATCH_SIZE = 100;

export type EncryptThreadsResult = {
  success: boolean;
  threadsProcessed: number;
  messagesEncrypted: number;
  errors: number;
  errorMessage?: string;
};

/**
 * Ported from ragen-app's
 * src/features/threads/services/commands/encrypt-threads-command.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md — Phase C, sixth (last)
 * slice. Admin-only batch KMS-encryption migration for pre-existing
 * plaintext thread messages — same shape as the already-ported
 * `DocumentEncryptionService` in the `documents` slice.
 */
@Injectable()
export class ThreadEncryptionService {
  private readonly logger = new Logger(ThreadEncryptionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async encryptThreads(orgId: string): Promise<EncryptThreadsResult> {
    if (!isEncryptionEnabled()) {
      return {
        success: false,
        threadsProcessed: 0,
        messagesEncrypted: 0,
        errors: 0,
        errorMessage: 'Encryption is not enabled (AWS_KMS_KEY_ID not set)',
      };
    }

    let threadsProcessed = 0;
    let messagesEncrypted = 0;
    let errors = 0;

    try {
      // Pagination relies on the encryptedDek: null filter — successfully
      // encrypted threads are excluded from subsequent queries. No cursor
      // needed.
      for (;;) {
        const threads = await this.prisma.client.thread.findMany({
          where: {
            organizationId: orgId,
            encryptedDek: null,
            messages: { some: {} },
          },
          select: {
            id: true,
            messages: { select: { id: true, content: true } },
          },
          take: BATCH_SIZE,
          orderBy: { id: 'asc' },
        });

        if (threads.length === 0) {
          break;
        }

        let batchProgress = 0;

        for (const thread of threads) {
          try {
            if (thread.messages.length === 0) {
              threadsProcessed++;
              batchProgress++;
              continue;
            }

            const { plaintextDek, encryptedDek } = await generateThreadKey();

            await this.prisma.client.$transaction(async (tx) => {
              for (const message of thread.messages) {
                const encrypted = encryptContent(message.content, plaintextDek);
                await tx.message.update({
                  where: { id: message.id },
                  data: { content: encrypted },
                });
              }

              await tx.thread.update({
                where: { id: thread.id },
                data: { encryptedDek },
              });
            });

            messagesEncrypted += thread.messages.length;
            threadsProcessed++;
            batchProgress++;

            this.logger.log(
              `Encrypted thread messages (threadId=${thread.id}, messageCount=${thread.messages.length})`,
            );
          } catch (error) {
            errors++;
            this.logger.error(
              `Failed to encrypt thread (threadId=${thread.id})`,
              error,
            );
          }
        }

        if (batchProgress === 0) {
          break;
        }
      }

      return {
        success: errors === 0,
        threadsProcessed,
        messagesEncrypted,
        errors,
      };
    } catch (error) {
      this.logger.error('Failed to run thread encryption migration', error);
      return {
        success: false,
        threadsProcessed,
        messagesEncrypted,
        errors,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Encrypt all unencrypted threads across ALL organizations. Admin-only
   * operation for global migration.
   */
  async encryptAllThreads(): Promise<EncryptThreadsResult> {
    if (!isEncryptionEnabled()) {
      return {
        success: false,
        threadsProcessed: 0,
        messagesEncrypted: 0,
        errors: 0,
        errorMessage: 'Encryption is not enabled (AWS_KMS_KEY_ID not set)',
      };
    }

    const orgs = await this.prisma.client.organization.findMany({
      select: { id: true },
    });

    let totalThreads = 0;
    let totalMessages = 0;
    let totalErrors = 0;

    for (const org of orgs) {
      const result = await this.encryptThreads(org.id);
      totalThreads += result.threadsProcessed;
      totalMessages += result.messagesEncrypted;
      totalErrors += result.errors;
    }

    return {
      success: totalErrors === 0,
      threadsProcessed: totalThreads,
      messagesEncrypted: totalMessages,
      errors: totalErrors,
    };
  }
}
