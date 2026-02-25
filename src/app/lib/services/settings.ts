import db from '@ragenai/prisma-client';
import { defaultOrganizationSettings } from '../constants/settings';
import { RawOrganizationSettings } from '../types/settings';
import { decryptApiKey, encryptApiKey } from '../utils/hashApiKey';
import { getRedisInstance } from './redis';
import { logger } from '../utils/logger';

const redis = getRedisInstance();

function cacheKey(orgId: string): string {
  return `org-settings:${orgId}`;
}

async function invalidateCache(orgId: string): Promise<void> {
  try {
    await redis.del(cacheKey(orgId));
  } catch {
    // Cache invalidation failure is non-critical
  }
}

async function upsertSettings(
  orgId: number,
  data: Record<string, unknown>
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
    } catch {
      // Cache write failure is non-critical
    }
  }

  return settings;
}

async function getCachedSettings(orgId: string) {
  try {
    const cached = await redis.get(cacheKey(orgId));
    if (cached) return JSON.parse(cached);
  } catch {
    // Cache read failure is non-critical, fall through to DB
  }
  return null;
}

function parseOrgId(orgId: string): number {
  return parseInt(orgId, 10);
}

// --- Temperature ---

export async function saveTemperatureSetting(
  orgId: string,
  temperature: number
): Promise<void> {
  await upsertSettings(parseOrgId(orgId), { temperature });
}

export async function getTemperatureSetting(orgId: string): Promise<number> {
  const settings = await getSettings(parseOrgId(orgId));
  return settings?.temperature ?? defaultOrganizationSettings.temperature;
}

// --- OpenAI API Key ---

export async function saveOpenaiAPIKey(
  orgId: string,
  apiKey: string
): Promise<void> {
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(parseOrgId(orgId), { openai_api_key: encrypted });
}

export async function getOpenaiAPIKey(orgId: string): Promise<string | null> {
  const settings = await getSettings(parseOrgId(orgId));
  if (!settings?.openai_api_key) return defaultOrganizationSettings.apiKey;
  return decryptApiKey(settings.openai_api_key);
}

// --- Anthropic API Key ---

export async function saveAnthropicAPIKey(
  orgId: string,
  apiKey: string
): Promise<void> {
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(parseOrgId(orgId), { anthropic_api_key: encrypted });
}

export async function getAnthropicAPIKey(
  orgId: string
): Promise<string | null> {
  const settings = await getSettings(parseOrgId(orgId));
  if (!settings?.anthropic_api_key) return null;
  return decryptApiKey(settings.anthropic_api_key);
}

// --- Google API Key ---

export async function saveGoogleAPIKey(
  orgId: string,
  apiKey: string
): Promise<void> {
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(parseOrgId(orgId), { google_api_key: encrypted });
}

export async function getGoogleAPIKey(orgId: string): Promise<string | null> {
  const settings = await getSettings(parseOrgId(orgId));
  if (!settings?.google_api_key) return null;
  return decryptApiKey(settings.google_api_key);
}

// --- Bedrock Credentials ---

export async function saveBedrockCredentials(
  orgId: string,
  credentials: { region: string; accessKeyId: string; secretAccessKey: string }
): Promise<void> {
  const encrypted = encryptApiKey(JSON.stringify(credentials));
  await upsertSettings(parseOrgId(orgId), {
    bedrock_credentials: encrypted,
  });
}

export async function getBedrockCredentials(orgId: string): Promise<{
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
} | null> {
  const settings = await getSettings(parseOrgId(orgId));
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
  host: string
): Promise<void> {
  await upsertSettings(parseOrgId(orgId), { ollama_host: host });
}

export async function getOllamaHost(orgId: string): Promise<string | null> {
  const settings = await getSettings(parseOrgId(orgId));
  return settings?.ollama_host ?? null;
}

// --- OpenRouter API Key ---

export async function saveOpenrouterAPIKey(
  orgId: string,
  apiKey: string
): Promise<void> {
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(parseOrgId(orgId), { openrouter_api_key: encrypted });
}

export async function getOpenrouterAPIKey(
  orgId: string
): Promise<string | null> {
  const settings = await getSettings(parseOrgId(orgId));
  if (!settings?.openrouter_api_key) return null;
  return decryptApiKey(settings.openrouter_api_key);
}

// --- Fireworks API Key ---

export async function saveFireworksAPIKey(
  orgId: string,
  apiKey: string
): Promise<void> {
  const encrypted = encryptApiKey(apiKey);
  await upsertSettings(parseOrgId(orgId), { fireworks_api_key: encrypted });
}

export async function getFireworksAPIKey(
  orgId: string
): Promise<string | null> {
  const settings = await getSettings(parseOrgId(orgId));
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
  }
): Promise<void> {
  const encrypted = encryptApiKey(JSON.stringify(credentials));
  await upsertSettings(parseOrgId(orgId), {
    azure_openai_credentials: encrypted,
  });
}

export async function getAzureOpenAICredentials(orgId: string): Promise<{
  apiKey: string;
  instanceName: string;
  deploymentName: string;
  apiVersion: string;
} | null> {
  const settings = await getSettings(parseOrgId(orgId));
  if (!settings?.azure_openai_credentials) return null;
  try {
    return JSON.parse(decryptApiKey(settings.azure_openai_credentials));
  } catch {
    return null;
  }
}

// --- Model ---

export async function saveModel(orgId: string, model: string): Promise<void> {
  await upsertSettings(parseOrgId(orgId), { model });
}

export async function getModel(orgId: string): Promise<string | null> {
  const settings = await getSettings(parseOrgId(orgId));
  return settings?.model ?? defaultOrganizationSettings.model;
}

// --- Assistant Prompt ---

export async function saveAssistantPrompt(
  orgId: string,
  prompt: string
): Promise<void> {
  await upsertSettings(parseOrgId(orgId), { prompt });
}

export async function getAssistantPrompt(
  orgId: string
): Promise<string | null> {
  const settings = await getSettings(parseOrgId(orgId));
  return settings?.prompt ?? null;
}

// --- Max Documents to Retrieve ---

export async function saveMaxDocumentsToRetrieve(
  orgId: string,
  maxDocumentsToRetrieve: number
): Promise<void> {
  await upsertSettings(parseOrgId(orgId), {
    max_documents_to_retrieve: maxDocumentsToRetrieve,
  });
}

export async function getMaxDocumentsToRetrieve(
  orgId: string
): Promise<number> {
  const settings = await getSettings(parseOrgId(orgId));
  return (
    settings?.max_documents_to_retrieve ??
    defaultOrganizationSettings.maxDocumentsToRetrieve
  );
}

// --- Voice ID ---

export async function saveVoiceId(
  orgId: string,
  voiceId: string
): Promise<void> {
  await upsertSettings(parseOrgId(orgId), { voice_id: voiceId });
}

export async function getVoiceId(orgId: string): Promise<string> {
  const settings = await getSettings(parseOrgId(orgId));
  return settings?.voice_id ?? 'JBFqnCBsd6RMkjVDRZzb';
}

// --- Get All Settings ---

export async function getAllSettings(
  orgId: string
): Promise<RawOrganizationSettings> {
  const settings = await getSettings(parseOrgId(orgId));

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
        decryptApiKey(settings.bedrock_credentials)
      );
    } catch {
      bedrockCredentials = null;
    }
  }

  let azureOpenaiCredentials = null;
  if (settings.azure_openai_credentials) {
    try {
      azureOpenaiCredentials = JSON.parse(
        decryptApiKey(settings.azure_openai_credentials)
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
