import { getApiKeyFromPool } from '../services/apiKeys';
import {
  OrganizationSettingsLimits,
  RawOrganizationSettings,
} from '../types/settings';

export const defaultOrganizationSettings: RawOrganizationSettings = {
  apiKey: getApiKeyFromPool(),
  prompt: '',
  model: 'gpt-4o',
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
