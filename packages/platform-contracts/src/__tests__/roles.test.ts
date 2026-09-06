import { describe, expect, it } from 'vitest';

import {
  APP_ADMIN_ROLE,
  NO_ACCESS_PRINCIPAL,
  APP_USER_ROLE,
  ORG_ADMIN_ROLE,
  ORG_MEMBER_ROLE,
  ORG_OWNER_ROLE,
  ORG_ROLES,
  canManageOrg,
  canOwnOrg,
  hasOrgRole,
  isAppAdmin,
  isOrgRole,
  orgVisibilityScope,
} from '../roles/roles';

describe('the organization role vocabulary', () => {
  it('holds exactly the three roles Better Auth is configured with', () => {
    expect([...ORG_ROLES]).toEqual(['member', 'admin', 'owner']);
  });

  it('is ordered weakest first, because hasOrgRole reads it as a rank', () => {
    expect(ORG_ROLES.indexOf(ORG_MEMBER_ROLE)).toBeLessThan(
      ORG_ROLES.indexOf(ORG_ADMIN_ROLE),
    );
    expect(ORG_ROLES.indexOf(ORG_ADMIN_ROLE)).toBeLessThan(
      ORG_ROLES.indexOf(ORG_OWNER_ROLE),
    );
  });

  it.each([
    ['owner', true],
    ['admin', true],
    ['member', true],
    ['manager', false],
    ['', false],
    [null, false],
    [undefined, false],
    [7, false],
  ])('isOrgRole(%p) is %p', (value, expected) => {
    expect(isOrgRole(value)).toBe(expected);
  });
});

describe('canManageOrg', () => {
  it.each([
    ['owner', true],
    ['admin', true],
    ['member', false],
    [null, false],
    [undefined, false],
  ])('%p may administer the organization: %p', (role, expected) => {
    expect(canManageOrg(role)).toBe(expected);
  });

  // The platform hierarchy uses the same word. A platform admin has no
  // standing inside a tenant they are not a member of, and this function is
  // only ever handed a `Member.role`; the test states the boundary rather than
  // trusting the two `'admin'`s to stay distinguishable by eye.
  it('says nothing about a platform administrator', () => {
    expect(canManageOrg(APP_ADMIN_ROLE)).toBe(true);
    expect(isAppAdmin({ role: ORG_MEMBER_ROLE })).toBe(false);
  });
});

describe('canOwnOrg', () => {
  it.each([
    ['owner', true],
    ['admin', false],
    ['member', false],
    [null, false],
  ])('%p may transfer or delete the organization: %p', (role, expected) => {
    expect(canOwnOrg(role)).toBe(expected);
  });
});

describe('orgVisibilityScope', () => {
  it.each([
    ['owner', 'organization'],
    ['admin', 'organization'],
    ['member', 'member'],
    ['manager', 'member'],
  ])('%p sees %p', (role, expected) => {
    expect(orgVisibilityScope(role)).toBe(expected);
  });

  // The whole point of ADR-39: an unknown role must fall to the *narrow*
  // answer. A future role added to `Member.role` without being taught to this
  // module hides rows; the opposite default would leak a tenant's documents to
  // whoever it was given to.
  it('defaults an unrecognised role to the member scope', () => {
    expect(orgVisibilityScope('something-new')).toBe('member');
  });

  // `Member.role` is non-nullable, so absent means "no membership row", not
  // "a member whose role we failed to read". The two must not collapse: the
  // member filter admits unowned org-wide files, and a non-member has no
  // claim on those.
  it.each([[null], [undefined]])(
    'reads %p as no membership at all, not as a member',
    (role) => {
      expect(orgVisibilityScope(role)).toBe('none');
    },
  );
});

describe('hasOrgRole', () => {
  it.each([
    ['owner', 'member', true],
    ['owner', 'admin', true],
    ['owner', 'owner', true],
    ['admin', 'member', true],
    ['admin', 'admin', true],
    ['admin', 'owner', false],
    ['member', 'member', true],
    ['member', 'admin', false],
    ['member', 'owner', false],
  ] as const)('%p reaches %p: %p', (memberRole, requiredRole, expected) => {
    expect(hasOrgRole(memberRole, requiredRole)).toBe(expected);
  });

  it.each([[null], [undefined], [''], ['manager']])(
    'refuses %p, which is on no rung of the ladder',
    (memberRole) => {
      expect(hasOrgRole(memberRole, ORG_MEMBER_ROLE)).toBe(false);
    },
  );
});

describe('isAppAdmin', () => {
  it.each([
    [{ role: APP_ADMIN_ROLE }, true],
    [{ role: APP_USER_ROLE }, false],
    [{ role: null }, false],
    [{}, false],
    [null, false],
    [undefined, false],
  ])('isAppAdmin(%p) is %p', (user, expected) => {
    expect(isAppAdmin(user)).toBe(expected);
  });
});

describe('NO_ACCESS_PRINCIPAL', () => {
  // Ingest writes `org:<id>` / `user:<id>` / `team:<id>`. A value carrying any
  // of those prefixes could one day equal a real principal, and the filter
  // would quietly start matching instead of matching nothing.
  it.each([['org:'], ['user:'], ['team:']])(
    'cannot be mistaken for a %s principal',
    (prefix) => {
      expect(NO_ACCESS_PRINCIPAL.startsWith(prefix)).toBe(false);
    },
  );

  it('contains no colon at all, so it cannot be parsed as one', () => {
    expect(NO_ACCESS_PRINCIPAL).not.toContain(':');
  });
});
