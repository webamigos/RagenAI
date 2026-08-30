import {
  type RawOrganizationSettings,
  type RagPipelineSettings,
} from './types.js';

/**
 * Duplicated from ragen-app's
 * src/features/organizations/constants/settings.ts (the two defaults this
 * slice needs) — see docs/adrs/21-monorepo-and-api-decoupling.md. Keep in
 * sync manually until a real shared package exists.
 */

export const defaultOrganizationSettings: RawOrganizationSettings = {
  apiKey: null,
  prompt: '',
  model: 'gemini-3-flash-preview',
  temperature: 0.8,
  maxDocumentsToRetrieve: 5,
  voiceId: 'JBFqnCBsd6RMkjVDRZzb',
} as const;

export const defaultRagPipelineSettings: RagPipelineSettings = {
  multiQueryEnabled: true,
  docSummariesEnabled: true,
  contentModerationEnabled: true,
  rerankingEnabled: true,
} as const;
