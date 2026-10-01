import 'server-only';

import {
  deleteAllOrgMemories,
  orgMemoryAdminFromSession,
} from '../memory-scope';

/**
 * Delete every member's memories in the session's organization. Org admins
 * and owners only (`canManageOrg`); it reads nothing. Returns how many
 * memories were deleted.
 */
export async function deleteAllOrgMemoriesCommand(): Promise<number> {
  return deleteAllOrgMemories(await orgMemoryAdminFromSession());
}
