export type SettingsRole = 'user' | 'orgAdmin' | 'orgOwner' | 'appAdmin';

export type SettingsIcon =
  | 'cog'
  | 'user'
  | 'puzzle'
  | 'building'
  | 'chart-bar'
  | 'shield-exclamation'
  | 'adjustments'
  | 'beaker'
  | 'chat-bubble'
  | 'user-group'
  | 'key'
  | 'shield-check'
  | 'cpu-chip'
  | 'circle-stack'
  | 'document-text';

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

/**
 * The organization-scoped screens, as data.
 *
 * `OrganizationNav` used to hold these as a hardcoded array with no visibility
 * information, which was safe only because `/organization/layout.tsx` gates
 * the whole group in one place. That is the asymmetry gap 8 has to resolve
 * before the two rails can be shown together: a list rendered outside the
 * layout's protection has to carry its own answer to "may this person see
 * it".
 *
 * **Every entry is `orgAdmin`, and that is not a guess.** The layout requires
 * `isAppAdmin || canManageOrg`, and the three pages that re-check anything —
 * `ai-usage`, `disk-usage`, `security` — re-check exactly that. No screen here
 * is owner-only or app-admin-only today. If one becomes so, its `requireRole`
 * is where that belongs, so the rail and the page cannot disagree.
 *
 * The routes do not move. `/organization/**` keeps its own layout and its own
 * guard; merging the *rails* must not merge the authorization, and the
 * cheapest way to guarantee that is to leave the guard exactly where it is.
 */
export const organizationRegistry: readonly SettingsPage[] = [
  {
    id: 'org-assistant-settings',
    path: '/organization/assistant-settings',
    labelKey: 'settings',
    icon: 'adjustments',
    order: 10,
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-rag-settings',
    path: '/organization/rag-settings',
    labelKey: 'rag-settings',
    icon: 'beaker',
    order: 20,
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-members',
    path: '/organization/profile',
    labelKey: 'members',
    icon: 'building',
    order: 30,
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-teams',
    path: '/organization/teams',
    labelKey: 'teams',
    icon: 'user-group',
    order: 40,
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-chatbots',
    path: '/organization/chatbots',
    labelKey: 'chatbots',
    icon: 'chat-bubble',
    order: 50,
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-api-keys',
    path: '/organization/api-keys',
    labelKey: 'api-keys',
    icon: 'key',
    order: 60,
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-security',
    path: '/organization/security',
    labelKey: 'security',
    icon: 'shield-check',
    order: 70,
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-ai-usage',
    path: '/organization/ai-usage',
    labelKey: 'ai-usage',
    icon: 'cpu-chip',
    order: 80,
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-disk-usage',
    path: '/organization/disk-usage',
    labelKey: 'disk-usage',
    icon: 'circle-stack',
    order: 90,
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-connectors',
    path: '/organization/connectors',
    labelKey: 'connectors',
    icon: 'puzzle',
    order: 100,
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-audit-logs',
    path: '/organization/audit-logs',
    labelKey: 'audit-logs',
    icon: 'document-text',
    order: 110,
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-knowledge-analytics',
    path: '/organization/knowledge-analytics',
    labelKey: 'knowledge-analytics',
    icon: 'chart-bar',
    order: 120,
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-pii-policy',
    path: '/organization/pii-policy',
    labelKey: 'pii-policy',
    icon: 'shield-exclamation',
    order: 130,
    visibility: { requireRole: 'orgAdmin' },
  },
];
