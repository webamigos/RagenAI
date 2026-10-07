import { describe, expect, it } from 'vitest';

import {
  computeAccessiblePrincipals,
  fileAccessWhere,
} from '../document-access';

const ORG = 'org_1';

describe('computeAccessiblePrincipals', () => {
  it('gives the owner access', () => {
    expect(
      computeAccessiblePrincipals({
        organizationId: ORG,
        ownerId: 'user_1',
        isOrgWide: false,
      }),
    ).toEqual(['user:user_1']);
  });

  // The whole point of the is_org_wide migration: a deleted owner leaves
  // `ownerId = null, isOrgWide = false`, and that must NOT read as org-wide.
  // Both former copies of this rule returned `['org:<id>']` here, which
  // published a deleted user's private files to every member.
  it('does not publish an ownerless file to the organization', () => {
    expect(
      computeAccessiblePrincipals({
        organizationId: ORG,
        ownerId: null,
        isOrgWide: false,
      }),
    ).toEqual([]);
  });

  // The other direction of the same drift: a file deliberately shared with
  // the organization reached nobody but its owner, because the flag was
  // never read.
  it('honours the org-wide flag alongside an owner', () => {
    expect(
      computeAccessiblePrincipals({
        organizationId: ORG,
        ownerId: 'user_1',
        isOrgWide: true,
      }),
    ).toEqual([`org:${ORG}`, 'user:user_1']);
  });

  it('keeps a legacy ownerless file readable once it is flagged', () => {
    expect(
      computeAccessiblePrincipals({
        organizationId: ORG,
        ownerId: null,
        isOrgWide: true,
      }),
    ).toEqual([`org:${ORG}`]);
  });

  it("includes the containing folder's team", () => {
    expect(
      computeAccessiblePrincipals({
        organizationId: ORG,
        ownerId: 'user_1',
        isOrgWide: false,
        folderTeamId: 'team_9',
      }),
    ).toEqual(['user:user_1', 'team:team_9']);
  });

  it('includes user and team grants, and ignores any other grantee type', () => {
    expect(
      computeAccessiblePrincipals({
        organizationId: ORG,
        ownerId: 'user_1',
        isOrgWide: false,
        grants: [
          { granteeType: 'user', granteeId: 'user_2' },
          { granteeType: 'team', granteeId: 'team_3' },
          { granteeType: 'something_else', granteeId: 'x' },
        ],
      }),
    ).toEqual(['user:user_1', 'user:user_2', 'team:team_3']);
  });

  it('de-duplicates a principal that arrives twice', () => {
    expect(
      computeAccessiblePrincipals({
        organizationId: ORG,
        ownerId: 'user_1',
        isOrgWide: false,
        folderTeamId: 'team_3',
        grants: [
          { granteeType: 'user', granteeId: 'user_1' },
          { granteeType: 'team', granteeId: 'team_3' },
        ],
      }),
    ).toEqual(['user:user_1', 'team:team_3']);
  });
});

describe('fileAccessWhere (the one definition of who may read a file)', () => {
  it('is unrestricted for the organization scope, and nothing for no scope', () => {
    expect(
      fileAccessWhere({ userId: 'u', teamIds: [], scope: 'organization' }),
    ).toEqual({});
    expect(
      fileAccessWhere({ userId: 'u', teamIds: [], scope: 'none' }),
    ).toEqual({
      id: { in: [] },
    });
  });

  it('does not treat an unowned file as org-wide: only isOrgWide does', () => {
    const where = fileAccessWhere({
      userId: 'u-1',
      teamIds: [],
      scope: 'member',
    }) as { OR: Record<string, unknown>[] };
    expect(where.OR).toContainEqual({ isOrgWide: true });
    expect(where.OR).toContainEqual({ ownerId: 'u-1' });
    expect(where.OR).not.toContainEqual({ ownerId: null });
  });

  it('adds team arms only when the actor has teams', () => {
    const solo = JSON.stringify(
      fileAccessWhere({ userId: 'u-1', teamIds: [], scope: 'member' }),
    );
    const teamed = JSON.stringify(
      fileAccessWhere({ userId: 'u-1', teamIds: ['t-1'], scope: 'member' }),
    );
    expect(solo).not.toContain('"team"');
    expect(teamed).toContain('"team"');
    expect(teamed).toContain('"teamId":{"in":["t-1"]}');
  });
});
