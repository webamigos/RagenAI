/**
 * Feature flags, resolved the same way everywhere.
 *
 * A flag is answered from three layers, in order: an explicit per-organization
 * override (`OrganizationSettings.featureOverrides`), then the plan
 * (`SubscriptionPlan.features`), then the code default below. `null` or a
 * missing key at either of the first two means "inherit", which is why the
 * override type is tri-state.
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
 */
export const DEFAULT_FEATURES: FeatureFlags = {
  inviteMembers: false,
  publicChatbot: false,
  apiAccess: true,
  mcpConnectors: true,
  customAssistantTemplates: true,
  voiceInput: false,
  publicThreadLinks: false,
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
