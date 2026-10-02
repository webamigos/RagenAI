import 'server-only';

import db from '@ragenai/prisma-client';
import { isEncryptionEnabled } from '@ragenai/crypto';

import { logger } from '@/app/lib/utils/logger';
import { jobs } from '@/libs/jobs';
import { maybeEncryptContent } from '@/features/messages/services/thread-content-encryption';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { memoryExtractionGate } from '../../utils/memory-extraction-gate';
import { getExtractionState, memoryOwnerFromSession } from '../memory-scope';

/**
 * Start a `memoryExtract` job for a saved turn, when the gate allows it
 * (spec 2026-09-27-personal-memory-across-threads, C3). Fire-and-forget at
 * the call site: it never throws, because memory must never fail a turn the
 * user is already reading; a turn whose enqueue fails is simply not
 * remembered.
 *
 * The question is the one the answering model saw — masked and past the
 * input guardrail — and it travels encrypted under the thread's own key, so
 * Redis never holds it in plaintext when encryption is on. The run id is
 * `memory-<messageId>`, so a repeated start for one turn is one job.
 */
export async function enqueueMemoryExtractionCommand({
  orgId,
  threadId,
  messageId,
  maskedQuestion,
  turnRefused,
}: {
  orgId: string;
  threadId: string;
  messageId: string;
  maskedQuestion: string;
  turnRefused: boolean;
}): Promise<void> {
  try {
    const owner = await memoryOwnerFromSession();
    if (owner.organizationId !== orgId) {
      return;
    }

    const [thread, featureOn, state] = await Promise.all([
      db.thread.findFirst({
        where: { id: threadId, organizationId: orgId },
        select: {
          kind: true,
          source: true,
          chatbotId: true,
          visitorId: true,
          teamId: true,
          publicLink: { select: { id: true } },
          _count: { select: { shares: true } },
        },
      }),
      isFeatureEnabledQuery(orgId, 'personalMemory'),
      getExtractionState(owner),
    ]);
    if (!thread) {
      return;
    }

    const refusal = memoryExtractionGate({
      thread: {
        kind: thread.kind,
        source: thread.source,
        chatbotId: thread.chatbotId,
        visitorId: thread.visitorId,
        teamId: thread.teamId,
        shareCount: thread._count.shares,
        hasPublicLink: thread.publicLink !== null,
      },
      sessionUserId: owner.userId,
      featureOn,
      extractionEnabled: state.extractionEnabled,
      turnRefused,
    });
    if (refusal) {
      return;
    }

    await jobs().start('memoryExtract', `memory-${messageId}`, {
      orgId,
      userId: owner.userId,
      threadId,
      messageId,
      epoch: state.epoch,
      question: await maybeEncryptContent(threadId, maskedQuestion),
      questionEncrypted: isEncryptionEnabled(),
    });
  } catch (err) {
    // The error's name only: a failed encrypt or enqueue must not put the
    // question into a log line.
    logger.warn(
      { err: { name: (err as Error)?.name }, messageId },
      'enqueueMemoryExtractionCommand: not enqueued; the turn is not remembered',
    );
  }
}
