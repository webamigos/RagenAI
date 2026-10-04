import { describe, it, expect } from 'vitest';

import { organizationRegistry, settingsRegistry } from '../registry';
import { canAccessSettingsPage } from '../filter';
import messages from '@/app/messages/en.json';

const MEMBER = {
  isAppAdmin: false,
  canManageOrg: false,
  isOrgOwner: false,
};
const ORG_ADMIN = { isAppAdmin: false, canManageOrg: true, isOrgOwner: false };
const APP_ADMIN = { isAppAdmin: true, canManageOrg: false, isOrgOwner: false };

describe('organizationRegistry', () => {
  it('hides every organization screen from an ordinary member', () => {
    // This is the whole safety property of gap 8. `/organization/**` is
    // guarded once in its layout, which is why the old hardcoded nav needed
    // no visibility data — but a rail that shows these beside the personal
    // settings renders outside that layout, where nothing else is checking.
    for (const page of organizationRegistry) {
      expect(canAccessSettingsPage(page.visibility, MEMBER)).toBe(false);
    }
  });

  it.each([
    ['an organization admin', ORG_ADMIN],
    ['an app admin', APP_ADMIN],
  ])('shows every organization screen to %s', (_who, ctx) => {
    // The layout requires `isAppAdmin || canManageOrg`, and the three pages
    // that re-check anything re-check exactly that. The rail has to agree
    // with the guard, or someone sees a link that redirects on click.
    for (const page of organizationRegistry) {
      expect(canAccessSettingsPage(page.visibility, ctx)).toBe(true);
    }
  });

  it('keeps every entry under /organization/, where the guard is', () => {
    // Moving a route out of that prefix silently removes its layout check.
    for (const page of organizationRegistry) {
      expect(page.path.startsWith('/organization/')).toBe(true);
    }
  });

  it('shares no id or path with the personal registry', () => {
    // They are rendered together; a collision would drop one silently, and
    // React would only complain about the key.
    const ids = [...settingsRegistry, ...organizationRegistry].map((p) => p.id);
    const paths = [...settingsRegistry, ...organizationRegistry].map(
      (p) => p.path,
    );

    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('gives every entry a distinct order, so the rail is deterministic', () => {
    const orders = organizationRegistry.map((p) => p.order);

    expect(new Set(orders).size).toBe(orders.length);
  });
});

describe('label keys, now that one component renders both registries', () => {
  it('qualifies every key with its namespace', () => {
    // The two registries' labels live in different namespaces. A bare key
    // resolves against whichever namespace the renderer picked, so an
    // organization entry would have rendered as its own key — visible only
    // to someone who opened that rail in that locale.
    for (const page of settingsRegistry) {
      expect(page.labelKey.startsWith('settings-page.nav.')).toBe(true);
    }
    for (const page of organizationRegistry) {
      expect(page.labelKey.startsWith('organization-page.nav.')).toBe(true);
    }
  });

  it('resolves every key against the English catalogue', () => {
    // A key that exists in the registry and not in the messages renders as
    // the key itself. Typecheck cannot see that; this can.
    const resolve = (key: string) =>
      key
        .split('.')
        .reduce<unknown>(
          (node, part) =>
            node && typeof node === 'object'
              ? (node as Record<string, unknown>)[part]
              : undefined,
          messages,
        );

    for (const page of [...settingsRegistry, ...organizationRegistry]) {
      expect(typeof resolve(page.labelKey)).toBe('string');
    }
    // The headings the two sidebar menus draw above their entries.
    expect(typeof resolve('settings-page.title')).toBe('string');
    expect(typeof resolve('organization-page.title')).toBe('string');
  });
});

/**
 * Which menu a screen appears in.
 *
 * The settings menu used to merge both registries under three eyebrows, which
 * put the organization's screens — Knowledge analytics and PII policy under
 * "Privacy", the rest under "Organization" — in the personal settings menu.
 * Each section now has its own menu in the sidebar, drawn from its own
 * registry, so a screen's menu is the registry it is in. These pin that the
 * split matches the guard: what needs an administrator is under the guarded
 * prefix, and what is personal is not.
 */
describe('menu membership', () => {
  it('keeps every personal screen under /settings, open to any member', () => {
    for (const page of settingsRegistry) {
      expect(page.path.startsWith('/settings/')).toBe(true);
      expect(page.visibility.requireRole ?? 'user').toBe('user');
    }
  });

  it('lists Knowledge analytics and PII policy with the organization, behind its guard', () => {
    const ids = organizationRegistry.map((p) => p.id);

    expect(ids).toContain('org-knowledge-analytics');
    expect(ids).toContain('org-pii-policy');
    for (const page of organizationRegistry) {
      expect(page.path.startsWith('/organization/')).toBe(true);
      expect(page.visibility.requireRole).toBe('orgAdmin');
    }
  });

  it('lists no screen in both menus', () => {
    const personal = new Set(settingsRegistry.map((p) => p.path));

    for (const page of organizationRegistry) {
      expect(personal.has(page.path)).toBe(false);
    }
  });
});
