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

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  inviteMembers: 'Invite members',
  publicChatbot: 'Public chatbot',
  apiAccess: 'API access',
  mcpConnectors: 'MCP connectors',
  customAssistantTemplates: 'Custom assistant templates',
  voiceInput: 'Voice dictation',
  publicThreadLinks: 'Public thread links',
};
