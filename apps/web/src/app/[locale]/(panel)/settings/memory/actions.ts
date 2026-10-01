'use server';

import { ZodError } from 'zod';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { logger } from '@/app/lib/utils/logger';
import { NotFoundException } from '@/libs/utils/errors';
import { isFeatureEnabledQuery } from '@/features/subscriptions/services/queries/get-effective-features-query';
import {
  countUserMemoriesQuery,
  getMemorySettingsQuery,
  getUserMemoriesQuery,
} from '@/features/memory/services/queries/get-user-memories-query';
import { updateUserMemoryCommand } from '@/features/memory/services/commands/update-user-memory-command';
import { deleteUserMemoryCommand } from '@/features/memory/services/commands/delete-user-memory-command';
import { forgetAllUserMemoriesCommand } from '@/features/memory/services/commands/forget-all-user-memories-command';
import { setMemoryExtractionCommand } from '@/features/memory/services/commands/set-memory-extraction-command';
import {
  MEMORY_MAX_ENTRIES,
  type UserMemoryView,
} from '@/features/memory/contracts/memory.types';

export type MemoryPageData = {
  /** `personalMemory` for the active organization. */
  enabled: boolean;
  /** Empty while the feature is off: the page offers deletion only. */
  memories: UserMemoryView[];
  /** What "forget everything" would delete, shown either way. */
  storedCount: number;
  maxEntries: number;
  extractionEnabled: boolean;
};

export type MemoryActionResult =
  | { success: true }
  | { success: false; error: 'not_found' | 'invalid' | 'off' | 'failed' };

const personalMemoryEnabled = async () =>
  isFeatureEnabledQuery(await getOrgIdFromAuthOrThrow(), 'personalMemory');

/**
 * Everything the settings page shows. The memories are always the session
 * user's own, through `memory-scope.ts`; nothing here takes a user id.
 */
export async function getMemoryPageAction(): Promise<MemoryPageData> {
  const enabled = await personalMemoryEnabled();
  const [memories, storedCount, settings] = await Promise.all([
    enabled ? getUserMemoriesQuery() : Promise.resolve([]),
    countUserMemoriesQuery(),
    getMemorySettingsQuery(),
  ]);
  return {
    enabled,
    memories,
    storedCount,
    maxEntries: MEMORY_MAX_ENTRIES,
    extractionEnabled: settings.extractionEnabled,
  };
}

async function run(
  name: string,
  requiresFeature: boolean,
  body: () => Promise<void>,
): Promise<MemoryActionResult> {
  try {
    if (requiresFeature && !(await personalMemoryEnabled())) {
      return { success: false, error: 'off' };
    }
    await body();
    return { success: true };
  } catch (err) {
    if (err instanceof NotFoundException) {
      return { success: false, error: 'not_found' };
    }
    if (err instanceof ZodError) {
      return { success: false, error: 'invalid' };
    }
    // Never the memory's text: the error is logged without its content.
    logger.error({ err: { name: (err as Error)?.name } }, `${name} failed`);
    return { success: false, error: 'failed' };
  }
}

export async function updateMemoryAction(
  publicId: string,
  content: string,
): Promise<MemoryActionResult> {
  return run('updateMemoryAction', true, () =>
    updateUserMemoryCommand(publicId, content),
  );
}

export async function deleteMemoryAction(
  publicId: string,
): Promise<MemoryActionResult> {
  return run('deleteMemoryAction', true, () =>
    deleteUserMemoryCommand(publicId),
  );
}

/**
 * Always allowed, whatever the organization's setting: a user can always
 * erase what is kept about them — an erasure right, not a feature.
 */
export async function forgetAllMemoriesAction(): Promise<MemoryActionResult> {
  return run('forgetAllMemoriesAction', false, () =>
    forgetAllUserMemoriesCommand(),
  );
}

export async function setMemoryExtractionAction(
  enabled: boolean,
): Promise<MemoryActionResult> {
  return run('setMemoryExtractionAction', true, () =>
    setMemoryExtractionCommand(enabled),
  );
}
