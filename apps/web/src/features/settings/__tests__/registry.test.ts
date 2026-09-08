import { describe, expect, it } from 'vitest';
import { settingsRegistry } from '../registry';
import { filterSettingsPages } from '../filter';

/**
 * Regression guard on the actual shape of the settings nav. The
 * separate filter.test.ts covers `filterSettingsPages` behaviour with
 * synthetic fixtures; this file pins the live registry against the
 * current decision — only user-level pages live under /settings/. Any
 * accidental re-introduction of an admin page here (e.g. audit-logs,
 * which now lives under /organization/) will flip the assertions.
 */

describe('settingsRegistry (actual)', () => {
  it('has unique ids', () => {
    const ids = settingsRegistry.map((page) => page.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique paths', () => {
    const paths = settingsRegistry.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('contains expected entries', () => {
    expect(settingsRegistry.map((page) => page.id).sort()).toEqual([
      'account',
      'connectors',
      'general',
      'shared-threads',
    ]);
  });

  it('lists no page that needs more than a plain user', () => {
    // The rule this file's header states, now enforced rather than described.
    // `knowledge-analytics` and `pii-policy` sat here with
    // `requireRole: 'orgAdmin'`, which put two administrator screens in the
    // personal settings menu; both moved to /organization/.
    const adminOnly = settingsRegistry
      .filter((page) => page.visibility.requireRole !== 'user')
      .map((page) => `${page.id} (${page.visibility.requireRole})`);

    expect(
      adminOnly,
      'An organization-scoped screen belongs under /organization/, in OrganizationNav.',
    ).toEqual([]);
  });

  it('does not list the two pages that moved to /organization/', () => {
    for (const id of ['knowledge-analytics', 'pii-policy']) {
      expect(settingsRegistry.some((p) => p.id === id)).toBe(false);
    }
  });

  it('does not list audit-logs — it moved to /organization/', () => {
    expect(settingsRegistry.some((p) => p.id === 'audit-logs')).toBe(false);
    expect(settingsRegistry.some((p) => p.path.includes('audit-logs'))).toBe(
      false,
    );
  });

  it('every entry points at /settings/', () => {
    for (const page of settingsRegistry) {
      expect(page.path.startsWith('/settings/')).toBe(true);
    }
  });
});

describe('filterSettingsPages over the real registry', () => {
  const ctx = {
    isAppAdmin: false,
    canManageOrg: false,
    isOrgOwner: false,
  };

  it('returns user-level pages for a regular user (no orgAdmin pages)', () => {
    const visible = filterSettingsPages(settingsRegistry, ctx).map((p) => p.id);
    expect(visible).toEqual([
      'general',
      'account',
      'connectors',
      'shared-threads',
    ]);
    expect(visible).not.toContain('pii-policy');
    expect(visible).not.toContain('knowledge-analytics');
  });

  it('shows an org admin the same pages as anyone else', () => {
    // Not a weakened assertion: the registry holds no admin-only page any
    // more, so role makes no difference here. An org admin's extra screens
    // live under /organization/, which has its own nav and its own guard.
    const visible = filterSettingsPages(settingsRegistry, {
      ...ctx,
      canManageOrg: true,
    }).map((p) => p.id);
    expect(visible).toEqual([
      'general',
      'account',
      'connectors',
      'shared-threads',
    ]);
  });

  it('returns user-level pages for an org owner (orgOwner role is separate from orgAdmin)', () => {
    const visible = filterSettingsPages(settingsRegistry, {
      ...ctx,
      isOrgOwner: true,
    }).map((p) => p.id);
    expect(visible).toEqual([
      'general',
      'account',
      'connectors',
      'shared-threads',
    ]);
  });

  it('shows an app admin the same pages too', () => {
    const visible = filterSettingsPages(settingsRegistry, {
      ...ctx,
      isAppAdmin: true,
    }).map((p) => p.id);
    expect(visible).toEqual([
      'general',
      'account',
      'connectors',
      'shared-threads',
    ]);
  });
});
