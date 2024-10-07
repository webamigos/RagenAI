import { redis } from '@/libs/db/redis';
import db from '@salesyy/prisma-client';

export async function getTemperatureSetting(): Promise<number> {
  const setting = await db.setting.findUnique({
    where: { key: 'temperature' },
  });

  return setting ? parseFloat(setting.value) : 0.7;
}

export async function getModelSetting(): Promise<string> {
  const setting = await db.setting.findUnique({
    where: { key: 'chat_model' },
  });

  return setting ? setting.value : 'gpt-3.5-turbo';
}

export async function getAssistantPrompt() {
  const prompt = await db.setting.findUnique({
    where: { key: 'assistant_prompt' },
  });

  return prompt?.value || '';
}

export async function getOpenaiAPIKey(userId: string) {
  const apiKey = await redis.hget(`user:${userId}:api_keys`, 'openai');
  return apiKey;
}

export async function saveOpenaiAPIKey(userId: string, apiKey: string) {
  await redis.hset(`user:${userId}:api_keys`, {
    openai: apiKey,
  });
}
