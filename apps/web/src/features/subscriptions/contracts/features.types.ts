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

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  inviteMembers: 'Invite members',
  publicChatbot: 'Public chatbot',
  apiAccess: 'API access',
  mcpConnectors: 'MCP connectors',
  customAssistantTemplates: 'Custom assistant templates',
};
