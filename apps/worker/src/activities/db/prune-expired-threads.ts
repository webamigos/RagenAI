import type { PruneExpiredThreadsResult } from '@ragenai/jobs';
import {
  isThreadRetentionDays,
  threadRetentionCutoff,
} from '@ragenai/platform-contracts';

import { db } from '../../services/db/index.js';
import { logger } from '../../services/logger.js';

/** Threads per transaction. Small enough that the row locks are brief. */
export const THREAD_RETENTION_BATCH_SIZE = 100;

/**
 * Batches per organization per run — 5,000 threads. The first run after an
 * organization turns retention on can find years of backlog; a ceiling keeps
 * one organization from holding the maintenance queue for hours, and the
 * cutoff comes from the clock, so the next run carries on where this stopped.
 */
export const THREAD_RETENTION_MAX_BATCHES = 50;

/**
 * Per-organization thread retention (spec
 * 2026-10-17-ragen-as-an-on-premises-appliance, B4).
 *
 * For each organization with `threadRetentionDays` set, deletes every thread
 * whose last activity — its newest message, or its creation when it has none
 * — is older than that many days, with its messages and everything hanging
 * off them (`db.deleteStaleThreads` lists what that is). Every kind of thread
 * the organization owns: chat, shared, publicly linked, chatbot-widget,
 * API-created, Ragen Brain's operator conversations and starred ones. A
 * retention period is the organization's rule, and a star or a share is not a
 * legal hold.
 *
 * An organization with no period (null, the default) is never read past its
 * settings row. A period that is not one of the presets is skipped with a
 * warning: it can only come from a hand-edited row, and guessing what it
 * meant is how the wrong conversations get deleted.
 *
 * Idempotent: a redelivered or retried run finds only what is still expired.
 * One organization's failure does not stop the others; it is counted, and the
 * run throws at the end so the engine records a failure and the step retries.
 * Logs ids and counts, never a title or a message.
 */
export async function pruneExpiredThreads(
  now: Date = new Date(),
): Promise<PruneExpiredThreadsResult> {
  const policies = await db.getThreadRetentionPolicies();

  const result: PruneExpiredThreadsResult = {
    organizationsWithRetention: policies.length,
    threadsDeleted: 0,
    messagesDeleted: 0,
    organizationsFailed: 0,
    organizationsCapped: 0,
  };

  for (const { organizationId, threadRetentionDays } of policies) {
    if (!isThreadRetentionDays(threadRetentionDays)) {
      logger.warn(
        { organizationId, threadRetentionDays },
        'Thread retention skipped: the stored period is not one of the presets',
      );
      continue;
    }

    const staleBefore = threadRetentionCutoff(threadRetentionDays, now);
    let threadsDeleted = 0;
    let messagesDeleted = 0;
    let capped = true;

    try {
      for (let batch = 0; batch < THREAD_RETENTION_MAX_BATCHES; batch += 1) {
        const deleted = await db.deleteStaleThreads(
          organizationId,
          staleBefore,
          { limit: THREAD_RETENTION_BATCH_SIZE },
        );
        threadsDeleted += deleted.threadsDeleted;
        messagesDeleted += deleted.messagesDeleted;

        if (deleted.threadsDeleted < THREAD_RETENTION_BATCH_SIZE) {
          capped = false;
          break;
        }
      }
    } catch (error) {
      result.organizationsFailed += 1;
      capped = false;
      logger.error(
        {
          organizationId,
          threadsDeleted,
          err: error instanceof Error ? error.message : String(error),
        },
        'Thread retention failed for an organization',
      );
    }

    result.threadsDeleted += threadsDeleted;
    result.messagesDeleted += messagesDeleted;
    if (capped) {
      result.organizationsCapped += 1;
    }

    logger.info(
      {
        organizationId,
        retentionDays: threadRetentionDays,
        staleBefore: staleBefore.toISOString(),
        threadsDeleted,
        messagesDeleted,
        capped,
      },
      'Thread retention applied',
    );
  }

  logger.info({ ...result }, 'Thread retention run completed');

  if (result.organizationsFailed > 0) {
    throw new Error(
      `Thread retention failed for ${result.organizationsFailed} of ${policies.length} organizations`,
    );
  }

  return result;
}
