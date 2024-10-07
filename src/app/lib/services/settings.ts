import { redis } from '@/libs/db/redis';

export async function saveTemperatureSetting(
  orgId: string,
  temperature: number
) {
  await redis.hset(`org:${orgId}`, {
    temperature: temperature.toString(),
  });
}

export async function getTemperatureSetting(orgId: string) {
  const temperature = await redis.hget(`org:${orgId}`, 'temperature');
  return temperature;
}

export async function getOpenaiAPIKey(orgId: string) {
  const apiKey = await redis.hget(`org:${orgId}`, 'openai');
  return apiKey;
}

export async function saveOpenaiAPIKey(orgId: string, apiKey: string) {
  await redis.hset(`org:${orgId}`, {
    openai: apiKey,
  });
}

export async function saveModel(orgId: string, model: string) {
  await redis.hset(`org:${orgId}`, {
    model,
  });
}

export async function getModel(orgId: string) {
  const model = await redis.hget(`org:${orgId}`, 'model');
  return model;
}

export async function saveAssistantPrompt(orgId: string, prompt: string) {
  await redis.hset(`org:${orgId}`, {
    prompt,
  });
}

export async function getAssistantPrompt(orgId: string) {
  const prompt = await redis.hget(`org:${orgId}`, 'prompt');
  return prompt;
}
