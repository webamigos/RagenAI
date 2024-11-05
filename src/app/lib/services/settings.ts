import { defaultOrganizationSettings } from '../constants/settings';
import { RawOrganizationSettings } from '../types/settings';
import { decryptApiKey, encryptApiKey } from '../utils/hashApiKey';
import { getRedisInstance } from './redis';

const redis = getRedisInstance();

export async function saveTemperatureSetting(
  orgId: string,
  temperature: number
): Promise<{ success: boolean; status: string }> {
  return await redis.hsetWithStatus(`org:${orgId}`, {
    temperature: temperature.toString(),
  });
}

export async function getTemperatureSetting(orgId: string): Promise<number> {
  const temperature = await redis.hget(`org:${orgId}`, 'temperature');
  return temperature
    ? parseFloat(temperature)
    : defaultOrganizationSettings.temperature;
}

export async function saveOpenaiAPIKey(
  orgId: string,
  apiKey: string
): Promise<{ success: boolean; status: string }> {
  const encryptedApiKey = encryptApiKey(apiKey);
  return await redis.hsetWithStatus(`org:${orgId}`, {
    openai: encryptedApiKey,
  });
}

export async function getOpenaiAPIKey(orgId: string): Promise<string | null> {
  const encryptedApiKey = await redis.hget(`org:${orgId}`, 'openai');
  if (!encryptedApiKey) {
    return null;
  }
  return decryptApiKey(encryptedApiKey);
}

export async function saveModel(
  orgId: string,
  model: string
): Promise<{ success: boolean; status: string }> {
  return await redis.hsetWithStatus(`org:${orgId}`, {
    model,
  });
}

export async function getModel(orgId: string): Promise<string | null> {
  const model = await redis.hget(`org:${orgId}`, 'model');
  return model ?? defaultOrganizationSettings.model;
}

export async function saveAssistantPrompt(
  orgId: string,
  prompt: string
): Promise<{ success: boolean; status: string }> {
  return await redis.hsetWithStatus(`org:${orgId}`, {
    prompt,
  });
}

export async function getAssistantPrompt(
  orgId: string
): Promise<string | null> {
  return await redis.hget(`org:${orgId}`, 'prompt');
}

export async function saveMaxDocumentsToRetrieve(
  orgId: string,
  maxDocumentsToRetrieve: number
): Promise<{ success: boolean; status: string }> {
  return await redis.hsetWithStatus(`org:${orgId}`, {
    maxDocumentsToRetrieve: maxDocumentsToRetrieve.toString(),
  });
}

export async function getMaxDocumentsToRetrieve(
  orgId: string
): Promise<number> {
  const maxDocumentsToRetrieve = await redis.hget(
    `org:${orgId}`,
    'maxDocumentsToRetrieve'
  );
  return maxDocumentsToRetrieve
    ? parseInt(maxDocumentsToRetrieve)
    : defaultOrganizationSettings.maxDocumentsToRetrieve;
}

export async function getAllSettings(
  orgId: string
): Promise<RawOrganizationSettings> {
  const result = await redis.hgetall(`org:${orgId}`);

  const decryptedApiKey = result.openai
    ? decryptApiKey(result.openai)
    : defaultOrganizationSettings.apiKey;

  return {
    apiKey: decryptedApiKey,
    model: result.model || defaultOrganizationSettings.model,
    temperature: +result.temperature || defaultOrganizationSettings.temperature,
    prompt: result.prompt || defaultOrganizationSettings.prompt,
    maxDocumentsToRetrieve:
      +result.maxDocumentsToRetrieve ||
      defaultOrganizationSettings.maxDocumentsToRetrieve,
  };
}
