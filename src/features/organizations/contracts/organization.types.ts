export type OrganizationVectorStore = 'meilisearch' | 'supabase';

export type OrganizationPublicMetadata = {
  hasKnowledge: boolean;
};

export type OrganizationMetadata = {
  publicMetadata?: OrganizationPublicMetadata;
  vectorStore?: OrganizationVectorStore;
};

// --- Account setup types ---

export type AccountSetupStatus = {
  organizationExists: boolean;
  organizationHasSubscription: boolean;
  organizationHasDefaultProject: boolean;
  accountSetupComplete: boolean;
  organizationId: string | null;
};

// --- Organization settings types ---

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

type LimitConfig = {
  min: number;
  max: number;
  step: number;
};

export type OrganizationSettingsLimits = {
  maxDocumentsToRetrieve: LimitConfig;
};

export type StorageLimits = {
  storageLimitBytes: number;
  projectStorageLimitBytes: number;
  singleFileLimitBytes: number;
};

export type StorageUsage = {
  knowledgeBaseBytes: number;
  knowledgeBaseFileCount: number;
  projectFilesBytes: number;
  projectFilesFileCount: number;
  threadFilesBytes: number;
  threadFilesFileCount: number;
  totalBytes: number;
  totalFileCount: number;
};

// --- Admin storage types ---

export type OrgStorageSummary = {
  orgId: string;
  orgName: string;
  totalBytes: number;
  fileCount: number;
  storageLimitBytes: number | null;
};

export type ProjectStorageSummary = {
  projectId: number;
  projectPublicId: string;
  projectTitle: string;
  totalBytes: number;
  fileCount: number;
};

// --- User & organization role types ---

export type UserRole = 'admin' | 'user' | 'guest' | 'visitor' | 'superAdmin';
export type OrgRole = 'org:member' | 'org:owner' | 'org:admin';

export type OrganizationRoles = {
  [key: string]: OrgRole;
};
