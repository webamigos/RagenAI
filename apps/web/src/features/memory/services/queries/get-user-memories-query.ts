import 'server-only';

import type {
  MemorySettings,
  UserMemoryView,
} from '../../contracts/memory.types';
import {
  getMemorySettings,
  listMemories,
  memoryOwnerFromSession,
} from '../memory-scope';

/** The signed-in user's memories in their active organization. */
export async function getUserMemoriesQuery(): Promise<UserMemoryView[]> {
  return listMemories(await memoryOwnerFromSession());
}

/** The signed-in user's memory switch in their active organization. */
export async function getMemorySettingsQuery(): Promise<MemorySettings> {
  return getMemorySettings(await memoryOwnerFromSession());
}
