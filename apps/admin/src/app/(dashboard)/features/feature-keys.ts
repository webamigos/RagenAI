export const FEATURE_KEYS = [
  'inviteMembers',
  'publicChatbot',
  'apiAccess',
  'mcpConnectors',
  'customAssistantTemplates',
  'voiceInput',
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];
export type FeatureOverrides = Partial<Record<FeatureKey, boolean | null>>;

/**
 * Display names for the admin UI. Lives here rather than beside each form so
 * the two consumers — per-org overrides and per-plan features — cannot drift,
 * and so `Record<FeatureKey, string>` makes typecheck the reminder to name a
 * newly added key.
 */
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  inviteMembers: 'Invite members',
  publicChatbot: 'Public chatbot',
  apiAccess: 'API access',
  mcpConnectors: 'MCP connectors',
  customAssistantTemplates: 'Custom assistant templates',
  voiceInput: 'Voice dictation',
};
