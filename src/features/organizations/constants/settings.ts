import type {
  OrganizationSettingsLimits,
  RawOrganizationSettings,
  StorageLimits,
} from '../contracts/organization.types';

export const DEFAULT_PROJECT_TITLE = 'Default Assistant';

export const defaultOrganizationSettings: RawOrganizationSettings = {
  apiKey: null,
  prompt: '',
  model: 'gemini-3-flash-preview',
  temperature: 0.8,
  maxDocumentsToRetrieve: 5,
  voiceId: 'JBFqnCBsd6RMkjVDRZzb',
} as const;

export const organizationSettingsLimits: OrganizationSettingsLimits = {
  maxDocumentsToRetrieve: {
    min: 2,
    max: 30,
    step: 1,
  },
} as const;

export const defaultStorageLimits: StorageLimits = {
  storageLimitBytes: 50 * 1024 * 1024, // 50 MB org-wide
  projectStorageLimitBytes: 20 * 1024 * 1024, // 20 MB per project
  singleFileLimitBytes: 5 * 1024 * 1024, // 5 MB per file
} as const;
