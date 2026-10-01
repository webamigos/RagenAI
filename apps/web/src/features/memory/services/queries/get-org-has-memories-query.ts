import 'server-only';

import { orgHasMemories, orgMemoryAdminFromSession } from '../memory-scope';

/** Whether any member of the session's organization has memories. Org admins only. */
export async function getOrgHasMemoriesQuery(): Promise<boolean> {
  return orgHasMemories(await orgMemoryAdminFromSession());
}
