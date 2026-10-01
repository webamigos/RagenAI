import 'server-only';

import type {
  MemorySettings,
  UserMemoryView,
} from '../../contracts/memory.types';
import {
  countMemories,
  getMemorySettings,
  listMemories,
  memoryOwnerFromSession,
} from '../memory-scope';

/** The signed-in user's memories in their active organization. */
export async function getUserMemoriesQuery(): Promise<UserMemoryView[]> {
  return listMemories(await memoryOwnerFromSession());
}

/** How many memories the signed-in user has stored in their active organization. */
export async function countUserMemoriesQuery(): Promise<number> {
  return countMemories(await memoryOwnerFromSession());
}

/** The signed-in user's memory switch in their active organization. */
export async function getMemorySettingsQuery(): Promise<MemorySettings> {
  return getMemorySettings(await memoryOwnerFromSession());
}
