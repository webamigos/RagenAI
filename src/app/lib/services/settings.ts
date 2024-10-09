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
  return temperature ? parseFloat(temperature) : 0.5;
}

export async function saveOpenaiAPIKey(
  orgId: string,
  apiKey: string
): Promise<{ success: boolean; status: string }> {
  return await redis.hsetWithStatus(`org:${orgId}`, {
    openai: apiKey,
  });
}

export async function getOpenaiAPIKey(orgId: string): Promise<string | null> {
  return await redis.hget(`org:${orgId}`, 'openai');
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
  return await redis.hget(`org:${orgId}`, 'model');
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
