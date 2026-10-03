import 'server-only';

import type { UndoMemoryChangeResult } from '../../contracts/memory.types';
import { memoryOwnerFromSession, undoMemoryChange } from '../memory-scope';

/** Revert one change a turn made to the signed-in user's memory. */
export async function undoMemoryChangeCommand(
  changePublicId: string,
): Promise<UndoMemoryChangeResult> {
  return undoMemoryChange(await memoryOwnerFromSession(), changePublicId);
}
