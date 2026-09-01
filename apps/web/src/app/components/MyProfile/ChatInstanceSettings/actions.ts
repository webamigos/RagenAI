'use server';
import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import { ASSISTANT_PROMPT_MAX_LENGTH } from '@/features/assistants/constants/limits';

import {
  getAssistantPrompt,
  getMaxDocumentsToRetrieve,
  getModel,
  getPublicChatModel,
  getOpenaiAPIKey,
  getTemperatureSetting,
  saveAssistantPrompt,
  saveMaxDocumentsToRetrieve,
  saveModel,
  savePublicChatModel,
  saveOpenaiAPIKey,
  saveTemperatureSetting,
  getVoiceId,
  saveVoiceId,
} from '@/features/organizations/services/organization-settings';
import { logger } from '@/app/lib/utils/logger';
import { SettingsType } from './types';
import { maskApiKey } from '@/app/lib/utils/hashApiKey';

type SaveSettingsActionResponse = { success: boolean; message: string };

type SettingsData = {
  apiKey: string;
  temperature: number;
  model: string;
  prompt: string;
  maxDocumentsToRetrieve: number;
};

type ApiKeyData = {
  apiKeyExists: boolean;
};

type ActionResponse<T> =
  | { success: false; message: string }
  | {
      success: true;
      data: T;
    };

const {
  apiKey,
  model,
  publicChatModel,
  prompt,
  temperature,
  maxDocumentsToRetrieve,
} = SettingsType;

//to replace by:
// https://www.npmjs.com/package/crypto-js
////

export const checkIfApiKeyExists = async (
  _orgId: string,
): Promise<ActionResponse<ApiKeyData>> => {
  const orgId = await getOrgIdFromAuthOrThrow();
  const apiKey = await getOpenaiAPIKey(orgId);
  const apiKeyExists = Boolean(apiKey);
  return {
    success: true,
    data: { apiKeyExists },
  };
};

export const fetchSettings = async (): Promise<
  ActionResponse<SettingsData>
> => {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId) {
    return {
      success: false,
      message: 'Unauthorized',
    };
  }

  try {
    const unmaskedApiKey = await getOpenaiAPIKey(orgId);
    const apiKey = unmaskedApiKey ? maskApiKey(unmaskedApiKey) : '';
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
    logger.error({ err: error }, 'Failed to fetch settings');
    return { success: false, message: 'Failed to fetch settings' };
  }
};

export const saveSetting = async (
  type: SettingsType,
  value: string | number,
): Promise<SaveSettingsActionResponse> => {
  const orgId = await getOrgIdFromAuthOrThrow();

  if (!orgId) {
    return { success: false, message: 'Unauthorized' };
  }

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

      case publicChatModel:
        await savePublicChatModel(orgId, (value as string) || null);
        return {
          success: true,
          message: 'Public chat model saved successfully',
        };

      case prompt: {
        if (typeof value !== 'string') {
          return { success: false, message: 'Invalid prompt value' };
        }
        if (value.length > ASSISTANT_PROMPT_MAX_LENGTH) {
          return {
            success: false,
            message: `Prompt exceeds maximum length of ${ASSISTANT_PROMPT_MAX_LENGTH} characters`,
          };
        }
        await saveAssistantPrompt(orgId, value);
        return {
          success: true,
          message: 'Assistant prompt saved successfully',
        };
      }

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
    logger.error({ err: error }, `Failed to save ${type}`);
    return { success: false, message: `Failed to save ${type}` };
  }
};

export async function fetchVoiceId(_organizationId: string) {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    const voiceId = await getVoiceId(orgId);
    return { success: true, data: { voiceId } };
  } catch (error) {
    return { success: false, error: 'Failed to fetch voice ID' };
  }
}

export async function fetchPublicChatModelAction() {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    const publicChatModel = await getPublicChatModel(orgId);
    return { success: true, data: { publicChatModel } };
  } catch {
    return { success: false, error: 'Failed to fetch public chat model' };
  }
}

export async function updateVoiceId(_organizationId: string, voiceId: string) {
  try {
    const orgId = await getOrgIdFromAuthOrThrow();
    await saveVoiceId(orgId, voiceId);
    return { success: true };
  } catch (error) {
    return { success: false, error: 'Failed to update voice ID' };
  }
}
