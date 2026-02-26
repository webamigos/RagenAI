import { getApiKeyFromPool } from '../services/queries/get-api-keys-query';
import type {
  OrganizationSettingsLimits,
  RawOrganizationSettings,
} from '../contracts/organization.types';

export const defaultOrganizationSettings: RawOrganizationSettings = {
  apiKey: getApiKeyFromPool(),
  prompt: '',
  model: 'openai/gpt-4o',
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
