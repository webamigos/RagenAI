import 'server-only';

import { deleteMemory, memoryOwnerFromSession } from '../memory-scope';

/** Delete one of the signed-in user's memories. */
export async function deleteUserMemoryCommand(publicId: string): Promise<void> {
  await deleteMemory(await memoryOwnerFromSession(), publicId);
}
