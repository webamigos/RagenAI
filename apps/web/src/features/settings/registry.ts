export type SettingsRole = 'user' | 'orgAdmin' | 'orgOwner' | 'appAdmin';

export type SettingsIcon = 'cog' | 'user' | 'puzzle';

export type SettingsVisibility = {
  requireRole?: SettingsRole;
  featureFlag?: string;
};

export type SettingsPage = {
  id: string;
  path: string;
  labelKey: string;
  /**
   * Identifier resolved to a concrete icon component on the client. We
   * can't ship a React component reference through an RSC boundary,
   * so the value here is just a stable string key.
   */
  icon: SettingsIcon;
  order: number;
  visibility: SettingsVisibility;
};

/**
 * Only user-level pages. An organization-scoped screen belongs under
 * `/organization/`, behind `OrganizationNav` and the org layout's admin
 * check — `knowledge-analytics` and `pii-policy` were listed here with
 * `requireRole: 'orgAdmin'`, which put two administrator screens in the
 * personal settings menu. `__tests__/registry.test.ts` now fails on any
 * entry that requires more than `user`.
 */
export const settingsRegistry: readonly SettingsPage[] = [
  {
    id: 'general',
    path: '/settings/general',
    labelKey: 'general',
    icon: 'cog',
    order: 10,
    visibility: { requireRole: 'user' },
  },
  {
    id: 'account',
    path: '/settings/account',
    labelKey: 'account',
    icon: 'user',
    order: 20,
    visibility: { requireRole: 'user' },
  },
  {
    id: 'connectors',
    path: '/settings/connectors',
    labelKey: 'connectors',
    icon: 'puzzle',
    order: 30,
    visibility: { requireRole: 'user' },
  },
  {
    id: 'shared-threads',
    path: '/settings/shared-threads',
    labelKey: 'shared-threads',
    icon: 'user',
    order: 35,
    visibility: { requireRole: 'user' },
  },
];
