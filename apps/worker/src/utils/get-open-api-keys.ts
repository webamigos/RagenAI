export type OrganizationSettings = {
  apiKey: string;
  prompt: string;
  model: string;
  temperature: number;
  maxDocumentsToRetrieve: number;
  voiceId: string;
};

export type RawOrganizationSettings = Omit<OrganizationSettings, 'apiKey'> & {
  apiKey: string | null;
};

export const defaultOrganizationSettings: RawOrganizationSettings = {
  apiKey: null,
  prompt: '',
  model: 'gpt-5.4-nano',
  temperature: 0.8,
  maxDocumentsToRetrieve: 5,
  voiceId: 'JBFqnCBsd6RMkjVDRZzb',
} as const;
