import type { MemoryPurgeResult } from '@ragenai/jobs';
import { MEMORY_CHANGE_RETENTION_DAYS } from '@ragenai/platform-contracts';

import { getPrisma } from '../../services/db/prisma.js';
import { logger } from '../../services/logger.js';

/**
 * The nightly personal-memory purge (spec
 * 2026-09-27-personal-memory-across-threads, C4), across every organization.
 *
 * - **Memories past `expiresAt`.** A dated ongoing-work memory is kept 30
 *   days past its date and is already neither read nor listed after that;
 *   this removes the row.
 * - **Change rows older than 30 days.** They exist for the thread's
 *   "Remembered · Undo" line, and undo is offered only while one exists.
 *
 * Deletes only, with the cutoff from the clock: a missed night is caught up
 * by the next one. Reads no content.
 */
export async function purgeExpiredMemories(
  now: Date = new Date(),
): Promise<MemoryPurgeResult> {
  const prisma = getPrisma();
  const changesOlderThan = new Date(
    now.getTime() - MEMORY_CHANGE_RETENTION_DAYS * 86_400_000,
  );

  const [memories, changes] = await prisma.$transaction([
    prisma.userMemory.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.userMemoryChange.deleteMany({
      where: { createdAt: { lt: changesOlderThan } },
    }),
  ]);

  logger.info(
    {
      memoriesDeleted: memories.count,
      changesDeleted: changes.count,
      changesOlderThan: changesOlderThan.toISOString(),
    },
    'Personal memory purge completed',
  );
  return {
    memoriesDeleted: memories.count,
    changesDeleted: changes.count,
    changesOlderThan: changesOlderThan.toISOString(),
  };
}
