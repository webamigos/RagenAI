import 'server-only';

import type { ThreadMemoryChanges } from '../../contracts/memory.types';
import {
  listThreadMemoryChanges,
  memoryOwnerFromSession,
} from '../memory-scope';

/** What each turn of one of the signed-in user's threads changed in their memory. */
export async function getThreadMemoryChangesQuery(
  threadId: string,
): Promise<ThreadMemoryChanges> {
  return listThreadMemoryChanges(await memoryOwnerFromSession(), threadId);
}
