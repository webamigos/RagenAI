import type { Organization } from '@/generated/prisma/client';

// --- Organization metadata types (from lib/types/organizations.ts) ---

export type OrganizationVectorStore = 'meilisearch' | 'supabase';

export type ClerkOrganizationPrivateMetadata = {
  ragen_org_id: Organization['id'];
  vector_store: OrganizationVectorStore;
};

export type ClerkOrganizationPublicMetadata = {
  hasKnowledge: boolean;
};

export type ClerkOrganizationMetadata = {
  publicMetadata?: ClerkOrganizationPublicMetadata;
  privateMetadata?: ClerkOrganizationPrivateMetadata;
};

// --- Account setup types (from lib/types/account-setup.ts) ---

export type AccountSetupStatus = {
  clerkOrganizationExists: boolean;
  internalOrganizationExists: boolean;
  organizationHasSubscription: boolean;
  organizationHasDefaultProject: boolean;
  accountSetupComplete: boolean;
  organizationId: string | null;
};

// --- Organization settings types (from lib/types/settings.ts) ---

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
  internalOrgId: number;
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

// --- User & organization role types (from contracts/User.ts) ---

export type UserRole = 'admin' | 'user' | 'guest' | 'visitor' | 'superAdmin';
export type OrgRole = 'org:member' | 'org:owner' | 'org:admin';

export type OrganizationRoles = {
  [key: string]: OrgRole;
};
