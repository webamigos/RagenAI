/**
 * Feature flags, resolved the same way everywhere.
 *
 * A flag is answered from four layers, in order: an explicit per-organization
 * override (`OrganizationSettings.featureOverrides`), then the plan
 * (`SubscriptionPlan.features`), then the platform default that the admin
 * panel edits (`Settings.default_features`), then the code default below.
 * `null` or a missing key at any of the first three means "inherit", which is
 * why those types are tri-state.
 *
 * The platform-default layer exists because of ADR-35. Without it the only
 * layer above the code constant was the plan, so a self-hosted installation —
 * where nobody manages plans — could answer "is API access on" only by
 * setting an override on each organization one at a time. An operator running
 * one installation for several client organizations needs to say it once.
 *
 * This was hand-copied into three workspaces before it lived here, and each
 * copy failed differently when it drifted: missing in apps/api the flag stopped
 * gating the public API path while still gating the app; missing in apps/admin
 * no platform administrator could turn it on for anyone. Typecheck could not
 * see any of it, because every copy derived its own union from its own array.
 */
export const FEATURE_KEYS = [
  'inviteMembers',
  'publicChatbot',
  'apiAccess',
  'mcpConnectors',
  'customAssistantTemplates',
  'voiceInput',
  'publicThreadLinks',
  'manageDocuments',
  'manageProjects',
  'manageOrganizationSettings',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export type FeatureFlags = Record<FeatureKey, boolean>;

/**
 * Tri-state per-org override: `true`/`false` force the value, `null`/missing
 * means "inherit from plan / code default".
 */
export type FeatureOverrides = Partial<Record<FeatureKey, boolean | null>>;

/**
 * Code defaults applied when neither plan nor org override sets a value.
 *
 * `inviteMembers` defaults to false to match the historical paid-only gate.
 * `voiceInput` defaults to false because voice dictation is opt-in: a platform
 * admin turns it on per organization, and until they do the microphone is
 * absent from the composer and `/api/transcribe` refuses the request.
 * `publicThreadLinks` defaults to false for the same reason, and it gates
 * reading an existing link as well as minting a new one — "off" that still
 * served every link already in circulation would not be off.
 * `publicChatbot` joins them: it covers both external chatbot surfaces (the
 * embedded widget and the hosted public assistant page), on the mint side and
 * the serve side. It defaulted to true while nothing could turn it off; that
 * is now a platform-admin decision per organization.
 * The remaining flags default to true so existing un-gated surfaces keep
 * working until plans are populated.
 *
 * The three `manage…` keys are the write side of an organization, and they
 * default to `true` for the same reason: every existing organization can do
 * these things today, and a key that arrived defaulting to `false` would take
 * document uploads away from every install on upgrade. They exist so an
 * operator can freeze an organization's corpus and configuration while
 * leaving chat working — a showcase tenant is the case that prompted them,
 * but "this client may read and ask, not restructure" is an ordinary
 * self-hosted arrangement (ADR-35).
 */
export const DEFAULT_FEATURES: FeatureFlags = {
  inviteMembers: false,
  publicChatbot: false,
  apiAccess: true,
  mcpConnectors: true,
  customAssistantTemplates: true,
  voiceInput: false,
  publicThreadLinks: false,
  manageDocuments: true,
  manageProjects: true,
  manageOrganizationSettings: true,
};

/** Human-readable names, shared so the admin panel and the app cannot disagree. */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  inviteMembers: 'Invite members',
  publicChatbot: 'Public chatbot',
  apiAccess: 'API access',
  mcpConnectors: 'MCP connectors',
  customAssistantTemplates: 'Custom assistant templates',
  voiceInput: 'Voice dictation',
  publicThreadLinks: 'Public thread links',
  manageDocuments: 'Add and remove documents',
  manageProjects: 'Create and delete projects',
  manageOrganizationSettings: 'Change organization settings',
};

/**
 * Keep only recognised keys with a usable value, dropping anything else.
 *
 * `featureOverrides` and `SubscriptionPlan.features` are untyped JSON columns,
 * so a stale key from an older release or a hand-edited row can arrive here.
 * Passing one through would render a control that writes a key nothing reads.
 */
export function sanitizeFeatureOverrides(
  input: Record<string, unknown> | null | undefined,
): FeatureOverrides {
  const out: FeatureOverrides = {};
  if (!input || typeof input !== 'object') {
    return out;
  }
  for (const key of FEATURE_KEYS) {
    const value = input[key];
    if (value === true || value === false || value === null) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Platform-wide defaults, editable by a platform administrator. Same
 * tri-state shape as an organization override: a key set to `null` or absent
 * means "fall through to the code default below".
 */
export type PlatformFeatureDefaults = FeatureOverrides;

/** `Settings` row that holds `PlatformFeatureDefaults`. */
export const PLATFORM_FEATURE_DEFAULTS_KEY = 'default_features';

/**
 * Which layer decided a flag.
 *
 * Returned alongside the value because an operator who can set an override
 * but cannot see what a feature currently evaluates to — or why — is not
 * really in control of it. The admin panel renders this.
 */
export type FeatureSource =
  'org-override' | 'plan' | 'platform-default' | 'code-default';

export type ResolvedFeature = {
  value: boolean;
  source: FeatureSource;
};

export type FeatureResolution = Record<FeatureKey, ResolvedFeature>;

export type FeatureResolutionInput = {
  /** `OrganizationSettings.featureOverrides`. Highest priority. */
  orgOverrides?: FeatureOverrides | null;
  /** `SubscriptionPlan.features` for the organization's effective plan. */
  planFeatures?: FeatureOverrides | null;
  /** `Settings.default_features`, set by a platform administrator. */
  platformDefaults?: PlatformFeatureDefaults | null;
};

/**
 * Resolve every flag, reporting which layer answered.
 *
 * The single place the precedence is expressed. apps/web gates features on
 * it and the admin panel explains it with it, so the two cannot disagree
 * about what an organization is entitled to — the failure mode that made
 * these contracts shared in the first place.
 */
export function resolveFeatures(
  input: FeatureResolutionInput,
): FeatureResolution {
  const org = sanitizeFeatureOverrides(
    input.orgOverrides as Record<string, unknown> | null | undefined,
  );
  const plan = sanitizeFeatureOverrides(
    input.planFeatures as Record<string, unknown> | null | undefined,
  );
  const platform = sanitizeFeatureOverrides(
    input.platformDefaults as Record<string, unknown> | null | undefined,
  );

  const out = {} as FeatureResolution;
  for (const key of FEATURE_KEYS) {
    // `null` is "inherit" at every layer, so only an explicit boolean stops
    // the walk. Checking `=== true || === false` rather than truthiness is
    // what makes an explicit `false` win over a lower layer's `true`.
    if (org[key] === true || org[key] === false) {
      out[key] = { value: org[key], source: 'org-override' };
    } else if (plan[key] === true || plan[key] === false) {
      out[key] = { value: plan[key], source: 'plan' };
    } else if (platform[key] === true || platform[key] === false) {
      out[key] = { value: platform[key], source: 'platform-default' };
    } else {
      out[key] = { value: DEFAULT_FEATURES[key], source: 'code-default' };
    }
  }
  return out;
}

/** The flags alone, for callers that only need to gate on them. */
export function flattenFeatures(resolution: FeatureResolution): FeatureFlags {
  const out = {} as FeatureFlags;
  for (const key of FEATURE_KEYS) {
    out[key] = resolution[key].value;
  }
  return out;
}

/** Human-readable, for the panel's "why is this on" column. */
export const FEATURE_SOURCE_LABELS: Record<FeatureSource, string> = {
  'org-override': 'set for this organization',
  plan: 'from the plan',
  'platform-default': 'platform default',
  'code-default': 'built-in default',
};
