import { describe, it, expect } from 'vitest';
import type { SettingsPage } from '../registry';
import {
  canAccessSettingsPage,
  filterSettingsPages,
  type SettingsAccessContext,
} from '../filter';

const page = (overrides: Partial<SettingsPage> = {}): SettingsPage => ({
  id: 'test',
  path: '/settings/test',
  labelKey: 'test',
  icon: 'cog',
  order: 100,
  group: 'you',
  visibility: {},
  ...overrides,
});

const ctx = (
  overrides: Partial<SettingsAccessContext> = {},
): SettingsAccessContext => ({
  isAppAdmin: false,
  canManageOrg: false,
  isOrgOwner: false,
  ...overrides,
});

describe('canAccessSettingsPage', () => {
  it('defaults to user role when requireRole is not set', () => {
    expect(canAccessSettingsPage({}, ctx())).toBe(true);
  });

  it('grants user role to everyone', () => {
    expect(canAccessSettingsPage({ requireRole: 'user' }, ctx())).toBe(true);
  });

  it('grants orgAdmin to org admins', () => {
    expect(
      canAccessSettingsPage(
        { requireRole: 'orgAdmin' },
        ctx({ canManageOrg: true }),
      ),
    ).toBe(true);
  });

  it('denies orgAdmin to regular members', () => {
    expect(canAccessSettingsPage({ requireRole: 'orgAdmin' }, ctx())).toBe(
      false,
    );
  });

  it('grants orgAdmin to app admins (elevated access)', () => {
    expect(
      canAccessSettingsPage(
        { requireRole: 'orgAdmin' },
        ctx({ isAppAdmin: true }),
      ),
    ).toBe(true);
  });

  it('grants orgOwner only to owners (not plain org admins)', () => {
    expect(
      canAccessSettingsPage(
        { requireRole: 'orgOwner' },
        ctx({ canManageOrg: true }),
      ),
    ).toBe(false);
    expect(
      canAccessSettingsPage(
        { requireRole: 'orgOwner' },
        ctx({ isOrgOwner: true }),
      ),
    ).toBe(true);
  });

  it('grants orgOwner to app admins', () => {
    expect(
      canAccessSettingsPage(
        { requireRole: 'orgOwner' },
        ctx({ isAppAdmin: true }),
      ),
    ).toBe(true);
  });

  it('grants appAdmin only to app admins', () => {
    expect(
      canAccessSettingsPage(
        { requireRole: 'appAdmin' },
        ctx({ isAppAdmin: true }),
      ),
    ).toBe(true);
    expect(
      canAccessSettingsPage(
        { requireRole: 'appAdmin' },
        ctx({ isOrgOwner: true, canManageOrg: true }),
      ),
    ).toBe(false);
  });

  it('denies access when a required feature flag is disabled', () => {
    expect(
      canAccessSettingsPage(
        { requireRole: 'user', featureFlag: 'BETA_FEATURE' },
        ctx({ featureFlags: { BETA_FEATURE: false } }),
      ),
    ).toBe(false);
  });

  it('denies access when a required feature flag is missing', () => {
    expect(
      canAccessSettingsPage(
        { requireRole: 'user', featureFlag: 'BETA_FEATURE' },
        ctx(),
      ),
    ).toBe(false);
  });

  it('grants access when the feature flag is enabled and role matches', () => {
    expect(
      canAccessSettingsPage(
        { requireRole: 'user', featureFlag: 'BETA_FEATURE' },
        ctx({ featureFlags: { BETA_FEATURE: true } }),
      ),
    ).toBe(true);
  });

  it('still requires the role even if the feature flag is enabled', () => {
    expect(
      canAccessSettingsPage(
        { requireRole: 'appAdmin', featureFlag: 'BETA_FEATURE' },
        ctx({ featureFlags: { BETA_FEATURE: true } }),
      ),
    ).toBe(false);
  });
});

describe('filterSettingsPages', () => {
  const registry: readonly SettingsPage[] = [
    page({ id: 'a', order: 30, visibility: { requireRole: 'user' } }),
    page({ id: 'b', order: 10, visibility: { requireRole: 'user' } }),
    page({ id: 'c', order: 20, visibility: { requireRole: 'appAdmin' } }),
    page({ id: 'd', order: 40, visibility: { requireRole: 'orgAdmin' } }),
  ];

  it('returns only user-level pages sorted by order for regular users', () => {
    const result = filterSettingsPages(registry, ctx());
    expect(result.map((p) => p.id)).toEqual(['b', 'a']);
  });

  it('includes orgAdmin pages for org admins', () => {
    const result = filterSettingsPages(registry, ctx({ canManageOrg: true }));
    expect(result.map((p) => p.id)).toEqual(['b', 'a', 'd']);
  });

  it('includes every page for app admins', () => {
    const result = filterSettingsPages(registry, ctx({ isAppAdmin: true }));
    expect(result.map((p) => p.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('returns a new sorted array without mutating the source registry', () => {
    const originalOrder = registry.map((p) => p.id);
    filterSettingsPages(registry, ctx({ isAppAdmin: true }));
    expect(registry.map((p) => p.id)).toEqual(originalOrder);
  });
});
