import db from '@ragenai/prisma-client';
import {
  DEFAULT_MONTHLY_COST_LIMIT_CENTS,
  defaultOrganizationSettings,
  defaultRagPipelineSettings,
  defaultStorageLimits,
} from '../constants/settings';
import { getApiKeyFromPool } from './queries/get-api-keys-query';
import type {
  RagPipelineSettings,
  RawOrganizationSettings,
  StorageLimits,
  UsageLimits,
  DefaultOrganizationLimits,
} from '../contracts/organization.types';
import { decryptApiKey, encryptApiKey } from '@/app/lib/utils/hashApiKey';

async function upsertSettings(
  orgId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db.organizationSettings.upsert({
    where: { organizationId: orgId },
    update: data,
    create: { organizationId: orgId, ...data },
  });
}

async function getSettings(orgId: string) {
  return db.organizationSettings.findUnique({
    where: { organizationId: orgId },
  });
}

// --- Temperature ---

export async function saveTemperatureSetting(
  orgId: string,
  temperature: number,
): Promise<void> {
  await upsertSettings(orgId, { temperature });
}

export async function getTemperatureSetting(orgId: string): Promise<number> {
  const settings = await getSettings(orgId);
  return settings?.temperature ?? defaultOrganizationSettings.temperature;
}

// --- LiteLLM API Key ---

export async function getLiteLLMOrgApiKey(
  orgId: string,
): Promise<string | null> {
  const settings = await getSettings(orgId);
  if (!settings?.litellmApiKey) {
    return null;
  }
  return decryptApiKey(settings.litellmApiKey);
}

// --- OpenAI API Key ---

export async function saveOpenaiAPIKey(
  orgId: string,
  apiKey: string,
): Promise<void> {
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(orgId, { openaiApiKey: encrypted });
}

export async function getOpenaiAPIKey(orgId: string): Promise<string | null> {
  const settings = await getSettings(orgId);
  if (!settings?.openaiApiKey) {
    return getApiKeyFromPool();
  }
  return decryptApiKey(settings.openaiApiKey);
}

// --- Anthropic API Key ---

export async function saveAnthropicAPIKey(
  orgId: string,
  apiKey: string,
): Promise<void> {
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(orgId, { anthropicApiKey: encrypted });
}

export async function getAnthropicAPIKey(
  orgId: string,
): Promise<string | null> {
  const settings = await getSettings(orgId);
  if (!settings?.anthropicApiKey) {
    return null;
  }
  return decryptApiKey(settings.anthropicApiKey);
}

// --- Google API Key ---

export async function saveGoogleAPIKey(
  orgId: string,
  apiKey: string,
): Promise<void> {
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(orgId, { googleApiKey: encrypted });
}

export async function getGoogleAPIKey(orgId: string): Promise<string | null> {
  const settings = await getSettings(orgId);
  if (!settings?.googleApiKey) {
    return null;
  }
  return decryptApiKey(settings.googleApiKey);
}

// --- Bedrock Credentials ---

export async function saveBedrockCredentials(
  orgId: string,
  credentials: { region: string; accessKeyId: string; secretAccessKey: string },
): Promise<void> {
  const encrypted = encryptApiKey(JSON.stringify(credentials));
  await upsertSettings(orgId, {
    bedrockCredentials: encrypted,
  });
}

export async function getBedrockCredentials(orgId: string): Promise<{
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
} | null> {
  const settings = await getSettings(orgId);
  if (!settings?.bedrockCredentials) {
    return null;
  }
  try {
    return JSON.parse(decryptApiKey(settings.bedrockCredentials));
  } catch {
    return null;
  }
}

// --- Ollama Host ---

export async function saveOllamaHost(
  orgId: string,
  host: string,
): Promise<void> {
  await upsertSettings(orgId, { ollamaHost: host });
}

export async function getOllamaHost(orgId: string): Promise<string | null> {
  const settings = await getSettings(orgId);
  return settings?.ollamaHost ?? null;
}

// --- OpenRouter API Key ---

export async function saveOpenrouterAPIKey(
  orgId: string,
  apiKey: string,
): Promise<void> {
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(orgId, { openrouterApiKey: encrypted });
}

export async function getOpenrouterAPIKey(
  orgId: string,
): Promise<string | null> {
  const settings = await getSettings(orgId);
  if (!settings?.openrouterApiKey) {
    return null;
  }
  return decryptApiKey(settings.openrouterApiKey);
}

// --- Fireworks API Key ---

export async function saveFireworksAPIKey(
  orgId: string,
  apiKey: string,
): Promise<void> {
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(orgId, { fireworksApiKey: encrypted });
}

export async function getFireworksAPIKey(
  orgId: string,
): Promise<string | null> {
  const settings = await getSettings(orgId);
  if (!settings?.fireworksApiKey) {
    return null;
  }
  return decryptApiKey(settings.fireworksApiKey);
}

// --- Azure OpenAI Credentials ---

export async function saveAzureOpenAICredentials(
  orgId: string,
  credentials: {
    apiKey: string;
    instanceName: string;
    deploymentName: string;
    apiVersion: string;
  },
): Promise<void> {
  const encrypted = encryptApiKey(JSON.stringify(credentials));
  await upsertSettings(orgId, {
    azureOpenaiCredentials: encrypted,
  });
}

export async function getAzureOpenAICredentials(orgId: string): Promise<{
  apiKey: string;
  instanceName: string;
  deploymentName: string;
  apiVersion: string;
} | null> {
  const settings = await getSettings(orgId);
  if (!settings?.azureOpenaiCredentials) {
    return null;
  }
  try {
    return JSON.parse(decryptApiKey(settings.azureOpenaiCredentials));
  } catch {
    return null;
  }
}

// --- Model ---

export async function saveModel(orgId: string, model: string): Promise<void> {
  await upsertSettings(orgId, { model });
}

export async function getModel(orgId: string): Promise<string | null> {
  const settings = await getSettings(orgId);
  return settings?.model ?? defaultOrganizationSettings.model;
}

// --- Public Chat Model ---

export async function savePublicChatModel(
  orgId: string,
  model: string | null,
): Promise<void> {
  await upsertSettings(orgId, { publicChatModel: model });
}

export async function getPublicChatModel(
  orgId: string,
): Promise<string | null> {
  const settings = await getSettings(orgId);
  return settings?.publicChatModel ?? null;
}

// --- Assistant Prompt ---

export async function saveAssistantPrompt(
  orgId: string,
  prompt: string,
): Promise<void> {
  await upsertSettings(orgId, { prompt });
}

export async function getAssistantPrompt(
  orgId: string,
): Promise<string | null> {
  const settings = await getSettings(orgId);
  return settings?.prompt ?? null;
}

// --- Max Documents to Retrieve ---

export async function saveMaxDocumentsToRetrieve(
  orgId: string,
  maxDocumentsToRetrieve: number,
): Promise<void> {
  await upsertSettings(orgId, {
    maxDocumentsToRetrieve: maxDocumentsToRetrieve,
  });
}

export async function getMaxDocumentsToRetrieve(
  orgId: string,
): Promise<number> {
  const settings = await getSettings(orgId);
  return (
    settings?.maxDocumentsToRetrieve ??
    defaultOrganizationSettings.maxDocumentsToRetrieve
  );
}

// --- Voice ID ---

export async function saveVoiceId(
  orgId: string,
  voiceId: string,
): Promise<void> {
  await upsertSettings(orgId, { voiceId: voiceId });
}

export async function getVoiceId(orgId: string): Promise<string> {
  const settings = await getSettings(orgId);
  return settings?.voiceId ?? 'JBFqnCBsd6RMkjVDRZzb';
}

// --- Storage Limits ---

export async function saveStorageLimits(
  orgId: string,
  limits: Partial<StorageLimits>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (limits.storageLimitBytes !== undefined) {
    data.storageLimitBytes = BigInt(limits.storageLimitBytes);
  }
  if (limits.projectStorageLimitBytes !== undefined) {
    data.projectStorageLimitBytes = BigInt(limits.projectStorageLimitBytes);
  }
  if (limits.singleFileLimitBytes !== undefined) {
    data.singleFileLimitBytes = BigInt(limits.singleFileLimitBytes);
  }
  await upsertSettings(orgId, data);
}

function mapStorageLimits(
  settings: Record<string, unknown> | null,
): StorageLimits {
  return {
    storageLimitBytes: Number(
      settings?.storageLimitBytes ?? defaultStorageLimits.storageLimitBytes,
    ),
    projectStorageLimitBytes: Number(
      settings?.projectStorageLimitBytes ??
        defaultStorageLimits.projectStorageLimitBytes,
    ),
    singleFileLimitBytes: Number(
      settings?.singleFileLimitBytes ??
        defaultStorageLimits.singleFileLimitBytes,
    ),
  };
}

export async function getStorageLimits(orgId: string): Promise<StorageLimits> {
  const settings = await getSettings(orgId);
  return mapStorageLimits(settings);
}

/** @deprecated Use getStorageLimits instead */
export const getStorageLimitsByOrgId = getStorageLimits;

// --- Usage Limits ---

export async function saveUsageLimits(
  orgId: string,
  limits: Partial<UsageLimits>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (limits.monthlyTokenLimit !== undefined) {
    data.monthlyTokenLimit =
      limits.monthlyTokenLimit !== null
        ? BigInt(limits.monthlyTokenLimit)
        : null;
  }
  if (limits.monthlyCostLimitCents !== undefined) {
    data.monthlyCostLimitCents = limits.monthlyCostLimitCents;
  }
  if (limits.monthlyMessageLimit !== undefined) {
    data.monthlyMessageLimit = limits.monthlyMessageLimit;
  }
  if (limits.maxMembers !== undefined) {
    data.maxMembers = limits.maxMembers;
  }
  await upsertSettings(orgId, data);
}

export async function getUsageLimits(orgId: string): Promise<UsageLimits> {
  const settings = await getSettings(orgId);
  return {
    monthlyTokenLimit:
      settings?.monthlyTokenLimit != null
        ? Number(settings.monthlyTokenLimit)
        : null,
    monthlyCostLimitCents: settings?.monthlyCostLimitCents ?? null,
    monthlyMessageLimit: settings?.monthlyMessageLimit ?? null,
    maxMembers: settings?.maxMembers ?? null,
  };
}

// --- Allowed Models ---

export async function getAllowedModels(orgId: string): Promise<string[]> {
  const settings = await getSettings(orgId);
  return settings?.allowedModels ?? [];
}

export async function saveAllowedModels(
  orgId: string,
  models: string[],
): Promise<void> {
  await upsertSettings(orgId, { allowedModels: models });
}

// --- Default Allowed Models ---

const DEFAULT_ALLOWED_MODELS_KEY = 'default_allowed_models';

export async function getDefaultAllowedModels(): Promise<string[]> {
  const row = await db.settings.findUnique({
    where: { key: DEFAULT_ALLOWED_MODELS_KEY },
  });
  if (!row) {
    return [];
  }
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export async function saveDefaultAllowedModels(
  models: string[],
): Promise<void> {
  await db.settings.upsert({
    where: { key: DEFAULT_ALLOWED_MODELS_KEY },
    update: { value: JSON.stringify(models) },
    create: { key: DEFAULT_ALLOWED_MODELS_KEY, value: JSON.stringify(models) },
  });
}

// --- Allowed Templates ---

export async function getAllowedTemplates(orgId: string): Promise<string[]> {
  const settings = await getSettings(orgId);
  return settings?.allowedTemplates ?? [];
}

export async function saveAllowedTemplates(
  orgId: string,
  templates: string[],
): Promise<void> {
  await upsertSettings(orgId, { allowedTemplates: templates });
}

const DEFAULT_ALLOWED_TEMPLATES_KEY = 'default_allowed_templates';

export async function getDefaultAllowedTemplates(): Promise<string[]> {
  const row = await db.settings.findUnique({
    where: { key: DEFAULT_ALLOWED_TEMPLATES_KEY },
  });
  if (!row) {
    return [];
  }
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export async function saveDefaultAllowedTemplates(
  templates: string[],
): Promise<void> {
  await db.settings.upsert({
    where: { key: DEFAULT_ALLOWED_TEMPLATES_KEY },
    update: { value: JSON.stringify(templates) },
    create: {
      key: DEFAULT_ALLOWED_TEMPLATES_KEY,
      value: JSON.stringify(templates),
    },
  });
}

// --- Allowed Connectors ---

export async function getAllowedConnectors(orgId: string): Promise<string[]> {
  const settings = await getSettings(orgId);
  return settings?.allowedConnectors ?? [];
}

export async function saveAllowedConnectors(
  orgId: string,
  connectors: string[],
): Promise<void> {
  await upsertSettings(orgId, { allowedConnectors: connectors });
}

const DEFAULT_ALLOWED_CONNECTORS_KEY = 'default_allowed_connectors';

export async function getDefaultAllowedConnectors(): Promise<string[]> {
  const row = await db.settings.findUnique({
    where: { key: DEFAULT_ALLOWED_CONNECTORS_KEY },
  });
  if (!row) {
    return [];
  }
  try {
    const parsed = JSON.parse(row.value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export async function saveDefaultAllowedConnectors(
  connectors: string[],
): Promise<void> {
  await db.settings.upsert({
    where: { key: DEFAULT_ALLOWED_CONNECTORS_KEY },
    update: { value: JSON.stringify(connectors) },
    create: {
      key: DEFAULT_ALLOWED_CONNECTORS_KEY,
      value: JSON.stringify(connectors),
    },
  });
}

// --- Default Organization Limits ---

const DEFAULT_LIMITS_KEY = 'default_organization_limits';

export async function getDefaultOrganizationLimits(): Promise<DefaultOrganizationLimits> {
  const row = await db.settings.findUnique({
    where: { key: DEFAULT_LIMITS_KEY },
  });
  if (!row) {
    return {
      storageLimitBytes: defaultStorageLimits.storageLimitBytes,
      projectStorageLimitBytes: defaultStorageLimits.projectStorageLimitBytes,
      singleFileLimitBytes: defaultStorageLimits.singleFileLimitBytes,
      monthlyTokenLimit: null,
      monthlyCostLimitCents: DEFAULT_MONTHLY_COST_LIMIT_CENTS,
      monthlyMessageLimit: null,
      maxMembers: null,
    };
  }
  try {
    const parsed = JSON.parse(row.value) as Partial<DefaultOrganizationLimits>;
    return {
      storageLimitBytes:
        parsed.storageLimitBytes ?? defaultStorageLimits.storageLimitBytes,
      projectStorageLimitBytes:
        parsed.projectStorageLimitBytes ??
        defaultStorageLimits.projectStorageLimitBytes,
      singleFileLimitBytes:
        parsed.singleFileLimitBytes ??
        defaultStorageLimits.singleFileLimitBytes,
      monthlyTokenLimit: parsed.monthlyTokenLimit ?? null,
      monthlyCostLimitCents: parsed.monthlyCostLimitCents ?? null,
      monthlyMessageLimit: parsed.monthlyMessageLimit ?? null,
      maxMembers: parsed.maxMembers ?? null,
    };
  } catch {
    return {
      storageLimitBytes: defaultStorageLimits.storageLimitBytes,
      projectStorageLimitBytes: defaultStorageLimits.projectStorageLimitBytes,
      singleFileLimitBytes: defaultStorageLimits.singleFileLimitBytes,
      monthlyTokenLimit: null,
      monthlyCostLimitCents: null,
      monthlyMessageLimit: null,
      maxMembers: null,
    };
  }
}

export async function saveDefaultOrganizationLimits(
  limits: Partial<DefaultOrganizationLimits>,
): Promise<void> {
  const current = await getDefaultOrganizationLimits();
  const merged = { ...current, ...limits };
  await db.settings.upsert({
    where: { key: DEFAULT_LIMITS_KEY },
    update: { value: JSON.stringify(merged) },
    create: { key: DEFAULT_LIMITS_KEY, value: JSON.stringify(merged) },
  });
}

export async function applyDefaultLimitsToOrg(orgId: string): Promise<void> {
  const [defaults, defaultModels, defaultConnectors, defaultTemplates] =
    await Promise.all([
      getDefaultOrganizationLimits(),
      getDefaultAllowedModels(),
      getDefaultAllowedConnectors(),
      getDefaultAllowedTemplates(),
    ]);
  const data: Record<string, unknown> = {};

  if (defaults.storageLimitBytes !== null) {
    data.storageLimitBytes = BigInt(defaults.storageLimitBytes);
  }
  if (defaults.projectStorageLimitBytes !== null) {
    data.projectStorageLimitBytes = BigInt(defaults.projectStorageLimitBytes);
  }
  if (defaults.singleFileLimitBytes !== null) {
    data.singleFileLimitBytes = BigInt(defaults.singleFileLimitBytes);
  }
  if (defaults.monthlyTokenLimit !== null) {
    data.monthlyTokenLimit = BigInt(defaults.monthlyTokenLimit);
  }
  if (defaults.monthlyCostLimitCents !== null) {
    data.monthlyCostLimitCents = defaults.monthlyCostLimitCents;
  }
  if (defaults.monthlyMessageLimit !== null) {
    data.monthlyMessageLimit = defaults.monthlyMessageLimit;
  }
  if (defaults.maxMembers !== null) {
    data.maxMembers = defaults.maxMembers;
  }
  if (defaultModels.length > 0) {
    data.allowedModels = defaultModels;
  }
  if (defaultConnectors.length > 0) {
    data.allowedConnectors = defaultConnectors;
  }
  if (defaultTemplates.length > 0) {
    data.allowedTemplates = defaultTemplates;
  }

  if (Object.keys(data).length > 0) {
    await upsertSettings(orgId, data);
  }
}

// --- RAG Pipeline Settings ---

export async function saveRagPipelineSettings(
  orgId: string,
  settings: Partial<RagPipelineSettings>,
): Promise<void> {
  const data: Record<string, unknown> = {};
  if (settings.multiQueryEnabled !== undefined) {
    data.multiQueryEnabled = settings.multiQueryEnabled;
  }
  if (settings.docSummariesEnabled !== undefined) {
    data.docSummariesEnabled = settings.docSummariesEnabled;
  }
  if (settings.contentModerationEnabled !== undefined) {
    data.contentModerationEnabled = settings.contentModerationEnabled;
  }
  if (settings.rerankingEnabled !== undefined) {
    data.rerankingEnabled = settings.rerankingEnabled;
  }
  await upsertSettings(orgId, data);
}

export async function getRagPipelineSettings(
  orgId: string,
): Promise<RagPipelineSettings> {
  const settings = await getSettings(orgId);
  return {
    multiQueryEnabled:
      settings?.multiQueryEnabled ??
      defaultRagPipelineSettings.multiQueryEnabled,
    docSummariesEnabled:
      settings?.docSummariesEnabled ??
      defaultRagPipelineSettings.docSummariesEnabled,
    contentModerationEnabled:
      settings?.contentModerationEnabled ??
      defaultRagPipelineSettings.contentModerationEnabled,
    rerankingEnabled:
      settings?.rerankingEnabled ?? defaultRagPipelineSettings.rerankingEnabled,
  };
}

// --- Default RAG Pipeline Settings ---

const DEFAULT_RAG_SETTINGS_KEY = 'default_rag_pipeline_settings';

export async function getDefaultRagPipelineSettings(): Promise<RagPipelineSettings> {
  const row = await db.settings.findUnique({
    where: { key: DEFAULT_RAG_SETTINGS_KEY },
  });
  if (!row) {
    return { ...defaultRagPipelineSettings };
  }
  try {
    const parsed = JSON.parse(row.value) as Partial<RagPipelineSettings>;
    return {
      multiQueryEnabled:
        parsed.multiQueryEnabled ??
        defaultRagPipelineSettings.multiQueryEnabled,
      docSummariesEnabled:
        parsed.docSummariesEnabled ??
        defaultRagPipelineSettings.docSummariesEnabled,
      contentModerationEnabled:
        parsed.contentModerationEnabled ??
        defaultRagPipelineSettings.contentModerationEnabled,
      rerankingEnabled:
        parsed.rerankingEnabled ?? defaultRagPipelineSettings.rerankingEnabled,
    };
  } catch {
    return { ...defaultRagPipelineSettings };
  }
}

export async function saveDefaultRagPipelineSettings(
  settings: Partial<RagPipelineSettings>,
): Promise<void> {
  const current = await getDefaultRagPipelineSettings();
  const merged = { ...current, ...settings };
  await db.settings.upsert({
    where: { key: DEFAULT_RAG_SETTINGS_KEY },
    update: { value: JSON.stringify(merged) },
    create: { key: DEFAULT_RAG_SETTINGS_KEY, value: JSON.stringify(merged) },
  });
}

export async function applyDefaultRagSettingsToOrg(
  orgId: string,
): Promise<void> {
  const defaults = await getDefaultRagPipelineSettings();
  const data: Record<string, unknown> = {
    multiQueryEnabled: defaults.multiQueryEnabled,
    docSummariesEnabled: defaults.docSummariesEnabled,
    contentModerationEnabled: defaults.contentModerationEnabled,
    rerankingEnabled: defaults.rerankingEnabled,
  };
  await upsertSettings(orgId, data);
}

// --- Get All Settings ---

export async function getAllSettings(
  orgId: string,
): Promise<RawOrganizationSettings> {
  const settings = await getSettings(orgId);

  if (!settings) {
    return {
      apiKey: getApiKeyFromPool(),
      anthropicApiKey: null,
      googleApiKey: null,
      bedrockCredentials: null,
      ollamaHost: null,
      openrouterApiKey: null,
      fireworksApiKey: null,
      azureOpenaiCredentials: null,
      model: defaultOrganizationSettings.model,
      temperature: defaultOrganizationSettings.temperature,
      prompt: defaultOrganizationSettings.prompt,
      maxDocumentsToRetrieve:
        defaultOrganizationSettings.maxDocumentsToRetrieve,
      voiceId: 'JBFqnCBsd6RMkjVDRZzb',
    };
  }

  const apiKey = settings.openaiApiKey
    ? decryptApiKey(settings.openaiApiKey)
    : getApiKeyFromPool();

  const anthropicApiKey = settings.anthropicApiKey
    ? decryptApiKey(settings.anthropicApiKey)
    : null;
  const googleApiKey = settings.googleApiKey
    ? decryptApiKey(settings.googleApiKey)
    : null;
  const openrouterApiKey = settings.openrouterApiKey
    ? decryptApiKey(settings.openrouterApiKey)
    : null;
  const fireworksApiKey = settings.fireworksApiKey
    ? decryptApiKey(settings.fireworksApiKey)
    : null;

  let bedrockCredentials = null;
  if (settings.bedrockCredentials) {
    try {
      bedrockCredentials = JSON.parse(
        decryptApiKey(settings.bedrockCredentials),
      );
    } catch {
      bedrockCredentials = null;
    }
  }

  let azureOpenaiCredentials = null;
  if (settings.azureOpenaiCredentials) {
    try {
      azureOpenaiCredentials = JSON.parse(
        decryptApiKey(settings.azureOpenaiCredentials),
      );
    } catch {
      azureOpenaiCredentials = null;
    }
  }

  return {
    apiKey,
    anthropicApiKey,
    googleApiKey,
    bedrockCredentials,
    ollamaHost: settings.ollamaHost || null,
    openrouterApiKey,
    fireworksApiKey,
    azureOpenaiCredentials,
    model: settings.model || defaultOrganizationSettings.model,
    temperature:
      settings.temperature ?? defaultOrganizationSettings.temperature,
    prompt: settings.prompt || defaultOrganizationSettings.prompt,
    maxDocumentsToRetrieve:
      settings.maxDocumentsToRetrieve ??
      defaultOrganizationSettings.maxDocumentsToRetrieve,
    voiceId: settings.voiceId || 'JBFqnCBsd6RMkjVDRZzb',
  };
}
