/**
 * Ported from ragen-app's src/features/subscriptions/contracts/features.types.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 */
export const FEATURE_KEYS = [
  'inviteMembers',
  'publicChatbot',
  'apiAccess',
  'mcpConnectors',
  'customAssistantTemplates',
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
 * `inviteMembers` defaults to false to match the historical paid-only gate;
 * the others default to true so existing un-gated surfaces keep working
 * until plans are populated.
 */
export const DEFAULT_FEATURES: FeatureFlags = {
  inviteMembers: false,
  publicChatbot: true,
  apiAccess: true,
  mcpConnectors: true,
  customAssistantTemplates: true,
};
