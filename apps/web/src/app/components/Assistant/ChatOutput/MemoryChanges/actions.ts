'use server';

import { ZodError } from 'zod';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import { getThreadMemoryChangesQuery } from '@/features/memory/services/queries/get-thread-memory-changes-query';
import { undoMemoryChangeCommand } from '@/features/memory/services/commands/undo-memory-change-command';
import type {
  ThreadMemoryChanges,
  UndoMemoryChangeResult,
} from '@/features/memory/contracts/memory.types';

const personalMemoryEnabled = async () =>
  isFeatureEnabledQuery(await getOrgIdFromAuthOrThrow(), 'personalMemory');

/**
 * The "Remembered · Undo" lines for one thread. Empty while the organization
 * has `personalMemory` off — the settings page then offers deletion only, and
 * the thread offers nothing — and empty when the changes cannot be read: the
 * line is a convenience, and a turn's answer must not depend on it.
 */
export async function getThreadMemoryChangesAction(
  threadId: string,
): Promise<ThreadMemoryChanges> {
  try {
    if (!(await personalMemoryEnabled())) {
      return {};
    }
    return await getThreadMemoryChangesQuery(threadId);
  } catch (err) {
    logger.warn(
      { err: { name: (err as Error)?.name } },
      'getThreadMemoryChangesAction: the changes could not be read',
    );
    return {};
  }
}

export type UndoMemoryChangeActionResult =
  | { success: true; result: UndoMemoryChangeResult }
  | { success: false; error: 'not_found' | 'invalid' | 'off' | 'failed' };

export async function undoMemoryChangeAction(
  changePublicId: string,
): Promise<UndoMemoryChangeActionResult> {
  try {
    if (!(await personalMemoryEnabled())) {
      return { success: false, error: 'off' };
    }
    return {
      success: true,
      result: await undoMemoryChangeCommand(changePublicId),
    };
  } catch (err) {
    if (err instanceof NotFoundException) {
      return { success: false, error: 'not_found' };
    }
    if (err instanceof ZodError) {
      return { success: false, error: 'invalid' };
    }
    logger.error(
      { err: { name: (err as Error)?.name } },
      'undoMemoryChangeAction failed',
    );
    return { success: false, error: 'failed' };
  }
}
