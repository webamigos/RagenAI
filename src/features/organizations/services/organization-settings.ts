import db from '@ragenai/prisma-client';
import {
  defaultOrganizationSettings,
  defaultStorageLimits,
} from '../constants/settings';
import type {
  RawOrganizationSettings,
  StorageLimits,
} from '../contracts/organization.types';
import { decryptApiKey, encryptApiKey } from '@/app/lib/utils/hashApiKey';
import { getRedisInstance } from '@/app/lib/services/redis';
import { logger } from '@/app/lib/utils/logger';

const redis = getRedisInstance();

function cacheKey(orgId: string): string {
  return `org-settings:${orgId}`;
}

async function invalidateCache(orgId: string): Promise<void> {
  try {
    await redis.del(cacheKey(orgId));
  } catch (err) {
    logger.warn({ err, cacheKey: cacheKey(orgId) }, 'Cache invalidate failed');
  }
}

async function resolveOrgId(orgId: string): Promise<number> {
  const org = await db.internalOrganization.findUnique({
    where: { provider_id: orgId },
    select: { id: true },
  });

  if (!org) {
    throw new Error(`InternalOrganization not found for provider_id: ${orgId}`);
  }

  return org.id;
}

async function upsertSettings(
  orgId: number,
  data: Record<string, unknown>,
): Promise<void> {
  await db.organizationSettings.upsert({
    where: { organization_id: orgId },
    update: data,
    create: { organization_id: orgId, ...data },
  });
  await invalidateCache(String(orgId));
}

async function getSettings(orgId: number) {
  const cached = await getCachedSettings(String(orgId));
  if (cached) return cached;

  const settings = await db.organizationSettings.findUnique({
    where: { organization_id: orgId },
  });

  if (settings) {
    try {
      await redis.set(cacheKey(String(orgId)), JSON.stringify(settings));
    } catch (err) {
      logger.warn(
        { err, cacheKey: cacheKey(String(orgId)) },
        'Cache write failed',
      );
    }
  }

  return settings;
}

async function getCachedSettings(orgId: string) {
  try {
    const cached = await redis.get(cacheKey(orgId));
    if (cached) return JSON.parse(cached);
  } catch (err) {
    logger.warn({ err, cacheKey: cacheKey(orgId) }, 'Cache read failed');
  }
  return null;
}

// --- Temperature ---

export async function saveTemperatureSetting(
  orgId: string,
  temperature: number,
): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  await upsertSettings(internalOrgId, { temperature });
}

export async function getTemperatureSetting(orgId: string): Promise<number> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  return settings?.temperature ?? defaultOrganizationSettings.temperature;
}

// --- OpenAI API Key ---

export async function saveOpenaiAPIKey(
  orgId: string,
  apiKey: string,
): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(internalOrgId, { openai_api_key: encrypted });
}

export async function getOpenaiAPIKey(orgId: string): Promise<string | null> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  if (!settings?.openai_api_key) return defaultOrganizationSettings.apiKey;
  return decryptApiKey(settings.openai_api_key);
}

// --- Anthropic API Key ---

export async function saveAnthropicAPIKey(
  orgId: string,
  apiKey: string,
): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(internalOrgId, { anthropic_api_key: encrypted });
}

export async function getAnthropicAPIKey(
  orgId: string,
): Promise<string | null> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  if (!settings?.anthropic_api_key) return null;
  return decryptApiKey(settings.anthropic_api_key);
}

// --- Google API Key ---

export async function saveGoogleAPIKey(
  orgId: string,
  apiKey: string,
): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(internalOrgId, { google_api_key: encrypted });
}

export async function getGoogleAPIKey(orgId: string): Promise<string | null> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  if (!settings?.google_api_key) return null;
  return decryptApiKey(settings.google_api_key);
}

// --- Bedrock Credentials ---

export async function saveBedrockCredentials(
  orgId: string,
  credentials: { region: string; accessKeyId: string; secretAccessKey: string },
): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  const encrypted = encryptApiKey(JSON.stringify(credentials));
  await upsertSettings(internalOrgId, {
    bedrock_credentials: encrypted,
  });
}

export async function getBedrockCredentials(orgId: string): Promise<{
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
} | null> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  if (!settings?.bedrock_credentials) return null;
  try {
    return JSON.parse(decryptApiKey(settings.bedrock_credentials));
  } catch {
    return null;
  }
}

// --- Ollama Host ---

export async function saveOllamaHost(
  orgId: string,
  host: string,
): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  await upsertSettings(internalOrgId, { ollama_host: host });
}

export async function getOllamaHost(orgId: string): Promise<string | null> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  return settings?.ollama_host ?? null;
}

// --- OpenRouter API Key ---

export async function saveOpenrouterAPIKey(
  orgId: string,
  apiKey: string,
): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(internalOrgId, { openrouter_api_key: encrypted });
}

export async function getOpenrouterAPIKey(
  orgId: string,
): Promise<string | null> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  if (!settings?.openrouter_api_key) return null;
  return decryptApiKey(settings.openrouter_api_key);
}

// --- Fireworks API Key ---

export async function saveFireworksAPIKey(
  orgId: string,
  apiKey: string,
): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(internalOrgId, { fireworks_api_key: encrypted });
}

export async function getFireworksAPIKey(
  orgId: string,
): Promise<string | null> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  if (!settings?.fireworks_api_key) return null;
  return decryptApiKey(settings.fireworks_api_key);
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
  const internalOrgId = await resolveOrgId(orgId);
  const encrypted = encryptApiKey(JSON.stringify(credentials));
  await upsertSettings(internalOrgId, {
    azure_openai_credentials: encrypted,
  });
}

export async function getAzureOpenAICredentials(orgId: string): Promise<{
  apiKey: string;
  instanceName: string;
  deploymentName: string;
  apiVersion: string;
} | null> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  if (!settings?.azure_openai_credentials) return null;
  try {
    return JSON.parse(decryptApiKey(settings.azure_openai_credentials));
  } catch {
    return null;
  }
}

// --- Model ---

export async function saveModel(orgId: string, model: string): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  await upsertSettings(internalOrgId, { model });
}

export async function getModel(orgId: string): Promise<string | null> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  return settings?.model ?? defaultOrganizationSettings.model;
}

// --- Assistant Prompt ---

export async function saveAssistantPrompt(
  orgId: string,
  prompt: string,
): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  await upsertSettings(internalOrgId, { prompt });
}

export async function getAssistantPrompt(
  orgId: string,
): Promise<string | null> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  return settings?.prompt ?? null;
}

// --- Max Documents to Retrieve ---

export async function saveMaxDocumentsToRetrieve(
  orgId: string,
  maxDocumentsToRetrieve: number,
): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  await upsertSettings(internalOrgId, {
    max_documents_to_retrieve: maxDocumentsToRetrieve,
  });
}

export async function getMaxDocumentsToRetrieve(
  orgId: string,
): Promise<number> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  return (
    settings?.max_documents_to_retrieve ??
    defaultOrganizationSettings.maxDocumentsToRetrieve
  );
}

// --- Voice ID ---

export async function saveVoiceId(
  orgId: string,
  voiceId: string,
): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  await upsertSettings(internalOrgId, { voice_id: voiceId });
}

export async function getVoiceId(orgId: string): Promise<string> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  return settings?.voice_id ?? 'JBFqnCBsd6RMkjVDRZzb';
}

// --- Storage Limits ---

export async function saveStorageLimits(
  orgId: string,
  limits: Partial<StorageLimits>,
): Promise<void> {
  const internalOrgId = await resolveOrgId(orgId);
  const data: Record<string, unknown> = {};
  if (limits.storageLimitBytes !== undefined)
    data.storage_limit_bytes = BigInt(limits.storageLimitBytes);
  if (limits.projectStorageLimitBytes !== undefined)
    data.project_storage_limit_bytes = BigInt(limits.projectStorageLimitBytes);
  if (limits.singleFileLimitBytes !== undefined)
    data.single_file_limit_bytes = BigInt(limits.singleFileLimitBytes);
  await upsertSettings(internalOrgId, data);
}

function mapStorageLimits(
  settings: Record<string, unknown> | null,
): StorageLimits {
  return {
    storageLimitBytes: Number(
      settings?.storage_limit_bytes ?? defaultStorageLimits.storageLimitBytes,
    ),
    projectStorageLimitBytes: Number(
      settings?.project_storage_limit_bytes ??
        defaultStorageLimits.projectStorageLimitBytes,
    ),
    singleFileLimitBytes: Number(
      settings?.single_file_limit_bytes ??
        defaultStorageLimits.singleFileLimitBytes,
    ),
  };
}

export async function getStorageLimits(orgId: string): Promise<StorageLimits> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);
  return mapStorageLimits(settings);
}

export async function getStorageLimitsByInternalOrgId(
  internalOrgId: number,
): Promise<StorageLimits> {
  const settings = await getSettings(internalOrgId);
  return mapStorageLimits(settings);
}

// --- Get All Settings ---

export async function getAllSettings(
  orgId: string,
): Promise<RawOrganizationSettings> {
  const internalOrgId = await resolveOrgId(orgId);
  const settings = await getSettings(internalOrgId);

  if (!settings) {
    return {
      apiKey: defaultOrganizationSettings.apiKey,
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

  const apiKey = settings.openai_api_key
    ? decryptApiKey(settings.openai_api_key)
    : defaultOrganizationSettings.apiKey;

  const anthropicApiKey = settings.anthropic_api_key
    ? decryptApiKey(settings.anthropic_api_key)
    : null;
  const googleApiKey = settings.google_api_key
    ? decryptApiKey(settings.google_api_key)
    : null;
  const openrouterApiKey = settings.openrouter_api_key
    ? decryptApiKey(settings.openrouter_api_key)
    : null;
  const fireworksApiKey = settings.fireworks_api_key
    ? decryptApiKey(settings.fireworks_api_key)
    : null;

  let bedrockCredentials = null;
  if (settings.bedrock_credentials) {
    try {
      bedrockCredentials = JSON.parse(
        decryptApiKey(settings.bedrock_credentials),
      );
    } catch {
      bedrockCredentials = null;
    }
  }

  let azureOpenaiCredentials = null;
  if (settings.azure_openai_credentials) {
    try {
      azureOpenaiCredentials = JSON.parse(
        decryptApiKey(settings.azure_openai_credentials),
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
    ollamaHost: settings.ollama_host || null,
    openrouterApiKey,
    fireworksApiKey,
    azureOpenaiCredentials,
    model: settings.model || defaultOrganizationSettings.model,
    temperature:
      settings.temperature ?? defaultOrganizationSettings.temperature,
    prompt: settings.prompt || defaultOrganizationSettings.prompt,
    maxDocumentsToRetrieve:
      settings.max_documents_to_retrieve ??
      defaultOrganizationSettings.maxDocumentsToRetrieve,
    voiceId: settings.voice_id || 'JBFqnCBsd6RMkjVDRZzb',
  };
}
