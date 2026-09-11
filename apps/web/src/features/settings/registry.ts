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

/**
 * Which eyebrow an entry sits under in the merged rail.
 *
 * It is a property of the screen, not of the registry it lives in. The two
 * registries are split by *where the guard is* — `/organization/**` has a
 * layout check and `/settings/**` does not — and that boundary is not the one
 * a reader is looking for. PII policy and Knowledge analytics are
 * administrator screens, so they must stay under the guarded prefix, and they
 * are also the two screens someone looks for under "privacy" rather than
 * under the organization's own settings.
 *
 * So the grouping is data on the entry and the routes do not move. Merging
 * the rails must not merge the authorization; this merges neither.
 */
export type SettingsGroup = 'you' | 'privacy' | 'organization';

export type SettingsVisibility = {
  requireRole?: SettingsRole;
  featureFlag?: string;
};

export type SettingsPage = {
  id: string;
  path: string;
  /**
   * A fully qualified message key, namespace included.
   *
   * The two registries are rendered by one component now, and their labels
   * live in different namespaces — `settings-page.nav` and
   * `organization-page.nav`. A bare key would resolve against whichever
   * namespace the renderer happened to pick, which is how an organization
   * entry would silently render as its own key.
   */
  labelKey: string;
  /**
   * Identifier resolved to a concrete icon component on the client. We
   * can't ship a React component reference through an RSC boundary,
   * so the value here is just a stable string key.
   */
  icon: SettingsIcon;
  order: number;
  group: SettingsGroup;
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
    labelKey: 'settings-page.nav.general',
    icon: 'cog',
    order: 10,
    group: 'you',
    visibility: { requireRole: 'user' },
  },
  {
    id: 'account',
    path: '/settings/account',
    labelKey: 'settings-page.nav.account',
    icon: 'user',
    order: 20,
    group: 'you',
    visibility: { requireRole: 'user' },
  },
  {
    id: 'connectors',
    path: '/settings/connectors',
    labelKey: 'settings-page.nav.connectors',
    icon: 'puzzle',
    order: 30,
    group: 'you',
    visibility: { requireRole: 'user' },
  },
  {
    id: 'shared-threads',
    path: '/settings/shared-threads',
    labelKey: 'settings-page.nav.shared-threads',
    icon: 'user',
    order: 35,
    group: 'you',
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
    labelKey: 'organization-page.nav.settings',
    icon: 'adjustments',
    order: 10,
    group: 'organization',
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-rag-settings',
    path: '/organization/rag-settings',
    labelKey: 'organization-page.nav.rag-settings',
    icon: 'beaker',
    order: 20,
    group: 'organization',
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-members',
    path: '/organization/profile',
    labelKey: 'organization-page.nav.members',
    icon: 'building',
    order: 30,
    group: 'organization',
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-teams',
    path: '/organization/teams',
    labelKey: 'organization-page.nav.teams',
    icon: 'user-group',
    order: 40,
    group: 'organization',
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-chatbots',
    path: '/organization/chatbots',
    labelKey: 'organization-page.nav.chatbots',
    icon: 'chat-bubble',
    order: 50,
    group: 'organization',
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-api-keys',
    path: '/organization/api-keys',
    labelKey: 'organization-page.nav.api-keys',
    icon: 'key',
    order: 60,
    group: 'organization',
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-security',
    path: '/organization/security',
    labelKey: 'organization-page.nav.security',
    icon: 'shield-check',
    order: 70,
    group: 'organization',
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-ai-usage',
    path: '/organization/ai-usage',
    labelKey: 'organization-page.nav.ai-usage',
    icon: 'cpu-chip',
    order: 80,
    group: 'organization',
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-disk-usage',
    path: '/organization/disk-usage',
    labelKey: 'organization-page.nav.disk-usage',
    icon: 'circle-stack',
    order: 90,
    group: 'organization',
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-connectors',
    path: '/organization/connectors',
    labelKey: 'organization-page.nav.connectors',
    icon: 'puzzle',
    order: 100,
    group: 'organization',
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-audit-logs',
    path: '/organization/audit-logs',
    labelKey: 'organization-page.nav.audit-logs',
    icon: 'document-text',
    order: 110,
    group: 'organization',
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-knowledge-analytics',
    path: '/organization/knowledge-analytics',
    labelKey: 'organization-page.nav.knowledge-analytics',
    icon: 'chart-bar',
    order: 120,
    group: 'privacy',
    visibility: { requireRole: 'orgAdmin' },
  },
  {
    id: 'org-pii-policy',
    path: '/organization/pii-policy',
    labelKey: 'organization-page.nav.pii-policy',
    icon: 'shield-exclamation',
    order: 130,
    group: 'privacy',
    visibility: { requireRole: 'orgAdmin' },
  },
];
