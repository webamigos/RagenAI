import { describe, expect, it } from 'vitest';

import { adminAc } from 'better-auth/plugins/admin/access';

import { platformAdminAc, platformRoles } from '../auth-access-control';

/**
 * Impersonation is closed by withholding a permission, not by a flag.
 *
 * better-auth 1.7.2's `admin` plugin has no `disableImpersonation`; its
 * impersonate route authorizes on `user: ["impersonate"]` and reads
 * `options.roles || defaultRoles`. So the guarantee is "our role does not
 * carry that permission" — which is exactly the sort of claim that decays
 * silently when somebody later copies the built-in role to add a statement.
 *
 * These assert the mechanism rather than the configuration: they call
 * `authorize` the same way the route does.
 */

describe('the platform administrator role', () => {
  it('cannot impersonate a user', () => {
    expect(platformAdminAc.authorize({ user: ['impersonate'] }).success).toBe(
      false,
    );
  });

  it('cannot impersonate another administrator either', () => {
    expect(
      platformAdminAc.authorize({ user: ['impersonate-admins'] }).success,
    ).toBe(false);
  });

  /**
   * The built-in role grants it, which is why leaving the plugin on its
   * defaults left the endpoint open. If this ever starts failing, better-auth
   * changed its defaults and the note in `auth-access-control.ts` needs
   * revisiting — not this file.
   */
  it("differs from better-auth's built-in role in exactly that", () => {
    expect(adminAc.authorize({ user: ['impersonate'] }).success).toBe(true);
  });

  it.each([
    ['ban', { user: ['ban'] as const }],
    ['set-role', { user: ['set-role'] as const }],
    ['list', { user: ['list'] as const }],
    ['delete', { user: ['delete'] as const }],
    ['revoke sessions', { session: ['revoke'] as const }],
  ])('still allows %s, which the panel depends on', (_label, permission) => {
    expect(platformAdminAc.authorize(permission).success).toBe(true);
  });

  it('is the role the plugin is handed', () => {
    // Passing `roles` replaces the defaults wholesale — a missing `user`
    // entry here would silently fall back to the permissive built-ins.
    expect(platformRoles.admin).toBe(platformAdminAc);
    expect(platformRoles).toHaveProperty('user');
  });
});

describe('the ordinary user role', () => {
  it('can do none of it', () => {
    expect(platformRoles.user.authorize({ user: ['list'] }).success).toBe(
      false,
    );
    expect(
      platformRoles.user.authorize({ user: ['impersonate'] }).success,
    ).toBe(false);
  });
});
