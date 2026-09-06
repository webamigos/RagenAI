import { describe, expect, it } from 'vitest';

import { ORG_ROLES } from '@ragenai/platform-contracts';

import { orgRoles } from '../auth-access-control';

/**
 * The registry Better Auth is handed, and the vocabulary the rest of the
 * monorepo reasons about, are two objects in two workspaces. They have to name
 * the same roles.
 *
 * The failure mode is asymmetric and neither half is loud:
 *
 *   In `orgRoles` but not `ORG_ROLES` — the plugin issues invitations for a
 *   role that `canManageOrg` and `orgVisibilityScope` have never heard of. It
 *   falls to the narrow answer, so the member silently sees nothing.
 *
 *   In `ORG_ROLES` but not `orgRoles` — every predicate honours the role while
 *   the invite endpoint rejects it with `ROLE_NOT_FOUND`, so nobody can be
 *   given it in the first place.
 *
 * Typecheck sees neither: both sides are internally consistent. This is the
 * cheap tripwire, and it is the reason ADR-39 says a new role has to be added
 * in two places rather than one.
 */
describe('the Better Auth organization role registry', () => {
  it('names exactly the roles the shared vocabulary knows', () => {
    expect(Object.keys(orgRoles).sort()).toEqual([...ORG_ROLES].sort());
  });
});
