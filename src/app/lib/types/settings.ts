export type OrganizationSettings = {
  apiKey: string;
  prompt: string;
  model: string;
  temperature: number;
  maxDocumentsToRetrieve: number;
};

export type RawOrganizationSettings = Omit<OrganizationSettings, 'apiKey'> & {
  apiKey: string | null;
};

type LimitConfig = {
  min: number;
  max: number;
  step: number;
};

export type OrganizationSettingsLimits = {
  maxDocumentsToRetrieve: LimitConfig;
};
