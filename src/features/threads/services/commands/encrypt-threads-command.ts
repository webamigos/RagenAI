'use server';

import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import {
  isEncryptionEnabled,
  generateThreadKey,
  encryptContent,
} from '@/libs/crypto/thread-encryption';

const BATCH_SIZE = 100;

export type EncryptThreadsResult = {
  success: boolean;
  threadsProcessed: number;
  messagesEncrypted: number;
  errors: number;
  errorMessage?: string;
};

/**
 * Encrypt all unencrypted thread messages for a given organization.
 * Processes threads in batches. Idempotent — skips already-encrypted threads.
 */
export async function encryptThreadsCommand(
  orgId: string,
): Promise<EncryptThreadsResult> {
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
    // Pagination relies on the encryptedDek: null filter — successfully encrypted
    // threads are excluded from subsequent queries. No cursor needed.
    while (true) {
      const threads = await db.thread.findMany({
        where: {
          organizationId: orgId,
          encryptedDek: null,
          messages: { some: {} },
        },
        select: {
          id: true,
          messages: {
            select: {
              id: true,
              content: true,
            },
          },
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

          // Encrypt all messages in a transaction
          await db.$transaction(async (tx) => {
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

          logger.info(
            {
              threadId: thread.id,
              messageCount: thread.messages.length,
            },
            'Encrypted thread messages',
          );
        } catch (error) {
          errors++;
          logger.error(
            { err: error, threadId: thread.id },
            'Failed to encrypt thread',
          );
        }
      }

      // If no threads were successfully processed, stop to avoid infinite loop
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
    logger.error({ err: error }, 'Failed to run thread encryption migration');
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
 * Encrypt all unencrypted threads across ALL organizations.
 * Admin-only operation for global migration.
 */
export async function encryptAllThreadsCommand(): Promise<EncryptThreadsResult> {
  if (!isEncryptionEnabled()) {
    return {
      success: false,
      threadsProcessed: 0,
      messagesEncrypted: 0,
      errors: 0,
      errorMessage: 'Encryption is not enabled (AWS_KMS_KEY_ID not set)',
    };
  }

  const orgs = await db.organization.findMany({
    select: { id: true },
  });

  let totalThreads = 0;
  let totalMessages = 0;
  let totalErrors = 0;

  for (const org of orgs) {
    const result = await encryptThreadsCommand(org.id);
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
