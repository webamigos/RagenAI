export type OrganizationVectorStore = 'qdrant' | 'meilisearch' | 'supabase';

export type PiiIngestionMode = 'destructive' | 'dual_content';

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

export type UsageLimits = {
  monthlyTokenLimit: number | null;
  monthlyCostLimitCents: number | null;
  monthlyMessageLimit: number | null;
  monthlyApiRequestLimit: number | null;
  maxMembers: number | null;
};

export type DefaultOrganizationLimits = {
  storageLimitBytes: number | null;
  projectStorageLimitBytes: number | null;
  singleFileLimitBytes: number | null;
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

// --- Admin storage types ---
//
// Declared once, in `@ragenai/platform-contracts` (ADR-35), because
// apps/admin's disk-usage page renders the same shapes and the two
// declarations had already drifted — this copy had no `usagePercent`, so the
// panel recomputed it. Re-exported here so existing imports keep working.
export type {
  OrgStorageSummary,
  ProjectStorageSummary,
} from '@ragenai/platform-contracts';

// --- User & organization role types ---
// Canonical role types live in @/lib/auth-access-control — re-export for convenience
export type { AppRole, OrgRole } from '@/lib/auth-access-control';
