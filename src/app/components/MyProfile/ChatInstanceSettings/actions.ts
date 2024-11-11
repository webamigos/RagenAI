'use server';
import { auth } from '@clerk/nextjs/server';

import {
  getAssistantPrompt,
  getMaxDocumentsToRetrieve,
  getModel,
  getOpenaiAPIKey,
  getTemperatureSetting,
  saveAssistantPrompt,
  saveMaxDocumentsToRetrieve,
  saveModel,
  saveOpenaiAPIKey,
  saveTemperatureSetting,
} from '@/app/lib/services/settings';
import { logger } from '@/app/lib/utils/logger';
import { SettingsType } from './types';
import {
  setSentryClerkContext,
  setSentryContext,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { Sentry } from 'pino-sentry';

const serviceName = 'ChatInstanceSettings';

type SaveSettingsActionResponse = { success: boolean; message: string };

type ActionResponse =
  | { success: false; message: string }
  | {
      success: true;
      data: {
        apiKey: string;
        temperature: number;
        model: string;
        prompt: string;
        maxDocumentsToRetrieve: number;
      };
    };

const { apiKey, model, prompt, temperature, maxDocumentsToRetrieve } =
  SettingsType;

//to replace by:
// https://www.npmjs.com/package/crypto-js
////

export const fetchSettings = async (): Promise<ActionResponse> => {
  const { orgId, userId, sessionId } = auth();

  if (!orgId) {
    return {
      success: false,
      message: 'Unauthorized',
    };
  }

  setSentryServiceTag(serviceName);
  setSentryClerkContext({ orgId, userId, sessionId });

  try {
    const apiKey = await getOpenaiAPIKey(orgId);
    const temperature = await getTemperatureSetting(orgId);
    const model = (await getModel(orgId)) ?? '';
    const prompt = (await getAssistantPrompt(orgId)) ?? '';
    const maxDocumentsToRetrieve = await getMaxDocumentsToRetrieve(orgId);

    if (!apiKey) {
      return { success: false, message: 'No API Key found' };
    }

    return {
      success: true,
      data: { apiKey, temperature, model, prompt, maxDocumentsToRetrieve },
    };
  } catch (error) {
    Sentry.captureException(error);
    logger.error('Failed to fetch settings:', error);
    return { success: false, message: 'Failed to fetch settings' };
  }
};

export const saveSetting = async (
  type: SettingsType,
  value: string | number
): Promise<SaveSettingsActionResponse> => {
  const { orgId, userId, sessionId } = auth();

  if (!orgId) {
    return { success: false, message: 'Unauthorized' };
  }

  setSentryServiceTag(serviceName);
  setSentryClerkContext({ orgId, userId, sessionId });
  setSentryContext('EXTRA_DATA', { type });

  try {
    switch (type) {
      case apiKey:
        await saveOpenaiAPIKey(orgId, value as string);
        return { success: true, message: 'API Key saved successfully' };

      case temperature:
        await saveTemperatureSetting(orgId, value as number);
        return {
          success: true,
          message: 'Temperature setting saved successfully',
        };

      case model:
        await saveModel(orgId, value as string);
        return { success: true, message: 'Model saved successfully' };

      case prompt:
        await saveAssistantPrompt(orgId, value as string);
        return {
          success: true,
          message: 'Assistant prompt saved successfully',
        };

      case maxDocumentsToRetrieve:
        await saveMaxDocumentsToRetrieve(orgId, value as number);
        return {
          success: true,
          message: 'Max documents to retrieve saved successfully',
        };

      default:
        return { success: false, message: 'Unknown setting type' };
    }
  } catch (error) {
    Sentry.captureException(error);
    logger.error(`Failed to save ${type}:`, error);
    return { success: false, message: `Failed to save ${type}` };
  }
};
