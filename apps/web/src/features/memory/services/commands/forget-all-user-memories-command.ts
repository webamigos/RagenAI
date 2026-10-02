import 'server-only';

import { forgetAllMemories, memoryOwnerFromSession } from '../memory-scope';

/**
 * Forget every memory the signed-in user has in this organization. Their
 * extraction switch stays as it is.
 */
export async function forgetAllUserMemoriesCommand(): Promise<void> {
  await forgetAllMemories(await memoryOwnerFromSession());
}
