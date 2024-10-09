'use server';

import {
  getAssistantPrompt,
  getModel,
  getOpenaiAPIKey,
  getTemperatureSetting,
  saveAssistantPrompt,
  saveModel,
  saveOpenaiAPIKey,
  saveTemperatureSetting,
} from '@/app/lib/services/settings';
import { logger } from '@/app/lib/utils/logger';
import { auth } from '@clerk/nextjs/server';

type SaveSettingsActionResponse = { success: boolean; message: string };

type SettingType = 'apiKey' | 'temperature' | 'model' | 'prompt';

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

export const saveSetting = async (
  type: SettingType,
  value: string | number
): Promise<SaveSettingsActionResponse> => {
  const { orgId } = auth();

  if (!orgId) {
    return { success: false, message: 'Unauthorized' };
  }

  try {
    switch (type) {
      case 'apiKey':
        await saveOpenaiAPIKey(orgId, value as string);
        return { success: true, message: 'API Key saved successfully' };

      case 'temperature':
        await saveTemperatureSetting(orgId, value as number);
        return {
          success: true,
          message: 'Temperature setting saved successfully',
        };

      case 'model':
        await saveModel(orgId, value as string);
        return { success: true, message: 'Model saved successfully' };

      case 'prompt':
        await saveAssistantPrompt(orgId, value as string);
        return {
          success: true,
          message: 'Assistant prompt saved successfully',
        };

      default:
        return { success: false, message: 'Unknown setting type' };
    }
  } catch (error) {
    logger.error(`Failed to save ${type}:`, error);
    return { success: false, message: `Failed to save ${type}` };
  }
};
