'use server';

import {
  getAssistantPrompt,
  getModel,
  getOpenaiAPIKey,
  getTemperatureSetting,
} from '@/app/lib/services/settings';
import { logger } from '@/app/lib/utils/logger';
import { auth } from '@clerk/nextjs/server';

type ActionResponse =
  | { success: false; message: string }
  | {
      success: true;
      data: {
        apiKey: string;
        temperature: number;
        model: string;
        prompt: string;
      };
    };

export const fetchSettings = async (): Promise<ActionResponse> => {
  const { orgId } = auth();

  if (!orgId) {
    return {
      success: false,
      message: 'Unauthorized',
    };
  }

  try {
    const apiKey = await getOpenaiAPIKey(orgId);
    const temperature = await getTemperatureSetting(orgId);
    const model = (await getModel(orgId)) ?? '';
    const prompt = (await getAssistantPrompt(orgId)) ?? '';

    if (!apiKey) {
      return { success: false, message: 'No API Key found' };
    }

    return { success: true, data: { apiKey, temperature, model, prompt } };
  } catch (error) {
    logger.error('Failed to fetch settings:', error);
    return { success: false, message: 'Failed to fetch settings' };
  }
};
