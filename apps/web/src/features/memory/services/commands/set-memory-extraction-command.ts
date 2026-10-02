import 'server-only';

import { memoryOwnerFromSession, setMemoryExtraction } from '../memory-scope';

/**
 * Turn the signed-in user's memory extraction on or off. Existing memories
 * are kept either way.
 */
export async function setMemoryExtractionCommand(
  enabled: boolean,
): Promise<void> {
  await setMemoryExtraction(await memoryOwnerFromSession(), enabled);
}
