export const FEATURE_KEYS = [
  'inviteMembers',
  'publicChatbot',
  'apiAccess',
  'mcpConnectors',
  'customAssistantTemplates',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureOverrides = Partial<Record<FeatureKey, boolean | null>>;
