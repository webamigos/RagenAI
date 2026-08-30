/**
 * Duplicated from ragen-app's
 * src/features/organizations/contracts/organization.types.ts (settings-
 * related types only) — see docs/adrs/21-monorepo-and-api-decoupling.md.
 * Keep in sync manually until a real shared package exists.
 */

export type OrganizationVectorStore = 'qdrant' | 'meilisearch' | 'supabase';

export type OrganizationPublicMetadata = {
  hasKnowledge: boolean;
};

export type OrganizationMetadata = {
  publicMetadata?: OrganizationPublicMetadata;
  vectorStore?: OrganizationVectorStore;
};

export type OrganizationSettings = {
  apiKey: string;
  anthropicApiKey?: string | null;
  googleApiKey?: string | null;
  bedrockCredentials?: {
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  } | null;
  ollamaHost?: string | null;
  openrouterApiKey?: string | null;
  fireworksApiKey?: string | null;
  azureOpenaiCredentials?: {
    apiKey: string;
    instanceName: string;
    deploymentName: string;
    apiVersion: string;
  } | null;
  prompt: string;
  model: string;
  temperature: number;
  maxDocumentsToRetrieve: number;
  voiceId: string;
};

export type RawOrganizationSettings = Omit<OrganizationSettings, 'apiKey'> & {
  apiKey: string | null;
};

export type UsageLimits = {
  monthlyTokenLimit: number | null;
  monthlyCostLimitCents: number | null;
  monthlyMessageLimit: number | null;
  monthlyApiRequestLimit: number | null;
  maxMembers: number | null;
};

export type RagPipelineSettings = {
  multiQueryEnabled: boolean;
  docSummariesEnabled: boolean;
  contentModerationEnabled: boolean;
  rerankingEnabled: boolean;
};

export type StorageLimits = {
  storageLimitBytes: number;
  projectStorageLimitBytes: number;
  singleFileLimitBytes: number;
};

export type StorageUsage = {
  knowledgeBaseBytes: number;
  knowledgeBaseFileCount: number;
  knowledgeBasePageCount: number;
  projectFilesBytes: number;
  projectFilesFileCount: number;
  projectFilesPageCount: number;
  threadFilesBytes: number;
  threadFilesFileCount: number;
  threadFilesPageCount: number;
  totalBytes: number;
  totalFileCount: number;
  totalPageCount: number;
};
