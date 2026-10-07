import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type { RetrievedSource } from '@/libs/chains/types/common';
import { recordRetrievalUsage } from '@ragenai/rag-core/retrieval-usage';
import { maybeEncryptContent } from '@/features/messages/services/thread-content-encryption';

/**
 * Record one RAG turn for knowledge analytics: what the model was shown, and
 * which of it the answer went on to cite. The rule — rank, the cited
 * intersection, fail-soft snippets — is `recordRetrievalUsage` in rag-core, so
 * `apps/api` records a turn the same way; this binds it to this app's
 * database client and its thread-key encryption.
 *
 * The snippet goes through `maybeEncryptContent`, the same function the
 * message went through (ADR-42): by the time this runs the message exists, so
 * the thread's key already does too.
 */
export async function recordKnowledgeUsageCommand(
  messageId: string,
  orgId: string,
  retrieved: readonly RetrievedSource[],
  answer: string,
  threadId: string,
): Promise<void> {
  await recordRetrievalUsage(retrieved, answer, {
    encryptSnippet: (snippet) =>
      maybeEncryptContent({ threadId, organizationId: orgId }, snippet),
    onSnippetEncryptionFailed: (err) => {
      logger.warn(
        { err, threadId },
        'Could not encrypt a source snippet — storing the retrieval without its quote',
      );
    },
    // One transaction. A process that died between the two writes would leave
    // the turn reading as "retrieved and never cited" — a metric Phase C
    // reports and someone acts on.
    writeUsage: async ({ retrievals, citedFileIds }) => {
      await db.$transaction([
        db.documentRetrieval.createMany({
          data: retrievals.map((row) => ({ ...row, messageId, orgId })),
          skipDuplicates: true,
        }),
        db.documentCitation.createMany({
          data: citedFileIds.map((fileId) => ({ messageId, fileId, orgId })),
          skipDuplicates: true,
        }),
      ]);
    },
  });
}
