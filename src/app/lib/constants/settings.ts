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
  maxDocumentsToRetrieve: 3,
} as const;

export const organizationSettingsLimits: OrganizationSettingsLimits = {
  maxDocumentsToRetrieve: {
    min: 2,
    max: 6,
    step: 1,
  },
} as const;
