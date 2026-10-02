import 'server-only';

import { memoryOwnerFromSession, updateMemory } from '../memory-scope';

/** Replace the text of one of the signed-in user's memories. */
export async function updateUserMemoryCommand(
  publicId: string,
  content: string,
): Promise<void> {
  await updateMemory(await memoryOwnerFromSession(), publicId, content);
}
