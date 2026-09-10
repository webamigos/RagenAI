import db from '@ragenai/prisma-client';
import { logger } from '@/app/lib/utils/logger';
import type { RetrievedSource } from '@/libs/chains/types/common';
import { selectCitedSources } from '@/features/documents/utils/cited-sources';
import { maybeEncryptContent } from '@/features/messages/services/thread-content-encryption';

/**
 * Record one RAG turn for knowledge analytics: what the model was shown, and
 * which of it the answer went on to cite.
 *
 * Both, because the difference is the useful part. A document retrieved on
 * every question and never cited is mis-chunked or genuinely irrelevant, and
 * against citations alone it looks identical to a document nobody asks about
 * — it cannot even show up as "unused", because retrieval keeps surfacing it.
 *
 * Cited is not retrieved. Writing the retrieved set as citations is how a
 * three-document corpus reported three citations on every answer (#972); the
 * citation is the intersection with the answer text, decided here and never
 * in the chain.
 *
 * Extracted from `assistant-stream.ts` rather than left inline: the caller is
 * a thousand-line streaming handler, and the rank arithmetic and the
 * transaction are the parts worth testing on their own.
 */
export async function recordKnowledgeUsageCommand(
  messageId: string,
  orgId: string,
  retrieved: readonly RetrievedSource[],
  answer: string,
  threadId: string,
): Promise<void> {
  if (retrieved.length === 0) {
    return;
  }

  const cited = selectCitedSources(retrieved, answer);

  // Encrypted before the transaction opens, not inside it. `maybeEncryptContent`
  // reads the thread and can create its key, and holding a transaction open
  // across that is a lock held for the length of a KMS round-trip.
  //
  // It is the *same* function the message went through, which is the whole
  // guarantee here: a snippet is a verbatim extract of a document sitting
  // beside the answer that quotes it, and the two are protected alike or the
  // weaker one decides. By the time this runs the message exists, so the key
  // already does too — this reuses it rather than racing to make one.
  const snippets = await Promise.all(
    retrieved.map(async ({ snippet }) => {
      if (!snippet) {
        return null;
      }
      try {
        return await maybeEncryptContent(threadId, snippet);
      } catch (err) {
        // A quote is the least important thing this command writes. The rows
        // themselves carry rank and drive the citation metrics, and before
        // snippets existed this command never touched KMS at all — so an
        // unavailable key would newly have cost the whole turn's analytics.
        //
        // Null rather than the plaintext. Storing the text unencrypted when
        // the message beside it *was* encrypted is precisely the divergence
        // ADR-42 exists to prevent, and it would be invisible: a readable
        // snippet looks like a working feature.
        logger.warn(
          { err, threadId },
          'Could not encrypt a source snippet — storing the retrieval without its quote',
        );
        return null;
      }
    }),
  );

  // One transaction. A process that died between the two writes would leave
  // the turn reading as "retrieved and never cited" — which is not an absence
  // here, it is a metric Phase C reports and someone acts on.
  await db.$transaction([
    db.documentRetrieval.createMany({
      // `retrieved` arrives deduped by file and ordered by final position
      // after dedupe and rerank (see `retrieveRelevantDocumentsWithIds`), so
      // the index is the rank. It is free to record now and unrecoverable
      // afterwards.
      data: retrieved.map(({ fileId }, index) => ({
        messageId,
        fileId,
        orgId,
        rank: index + 1,
        snippet: snippets[index],
      })),
      skipDuplicates: true,
    }),
    db.documentCitation.createMany({
      data: cited.map(({ fileId }) => ({
        messageId,
        fileId,
        orgId,
      })),
      skipDuplicates: true,
    }),
  ]);
}
