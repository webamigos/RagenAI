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
      'knowledge-analytics',
      'shared-threads',
    ]);
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
    isOrgAdmin: false,
    isOrgOwner: false,
  };

  it('returns user-level pages for a regular user', () => {
    const visible = filterSettingsPages(settingsRegistry, ctx).map((p) => p.id);
    expect(visible).toEqual([
      'general',
      'account',
      'connectors',
      'shared-threads',
    ]);
  });

  it('returns user-level + orgAdmin pages for an org admin', () => {
    const visible = filterSettingsPages(settingsRegistry, {
      ...ctx,
      isOrgAdmin: true,
    }).map((p) => p.id);
    expect(visible).toEqual([
      'general',
      'account',
      'connectors',
      'shared-threads',
      'knowledge-analytics',
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

  it('returns all pages for an app admin', () => {
    const visible = filterSettingsPages(settingsRegistry, {
      ...ctx,
      isAppAdmin: true,
    }).map((p) => p.id);
    expect(visible).toEqual([
      'general',
      'account',
      'connectors',
      'shared-threads',
      'knowledge-analytics',
    ]);
  });
});
