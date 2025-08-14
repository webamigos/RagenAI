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
    return defaultOrganizationSettings.apiKey;
  }
  return decryptApiKey(encryptedApiKey);
}

export async function saveAnthropicAPIKey(
  orgId: string,
  apiKey: string
): Promise<{ success: boolean; status: string }> {
  const encryptedApiKey = encryptApiKey(apiKey);
  return await redis.hsetWithStatus(`org:${orgId}`, {
    anthropic: encryptedApiKey,
  });
}

export async function getAnthropicAPIKey(
  orgId: string
): Promise<string | null> {
  const encryptedApiKey = await redis.hget(`org:${orgId}`, 'anthropic');
  if (!encryptedApiKey) {
    return null;
  }
  return decryptApiKey(encryptedApiKey);
}

export async function saveGoogleAPIKey(
  orgId: string,
  apiKey: string
): Promise<{ success: boolean; status: string }> {
  const encryptedApiKey = encryptApiKey(apiKey);
  return await redis.hsetWithStatus(`org:${orgId}`, {
    google: encryptedApiKey,
  });
}

export async function getGoogleAPIKey(orgId: string): Promise<string | null> {
  const encryptedApiKey = await redis.hget(`org:${orgId}`, 'google');
  if (!encryptedApiKey) {
    return null;
  }
  return decryptApiKey(encryptedApiKey);
}

export async function saveBedrockCredentials(
  orgId: string,
  credentials: { region: string; accessKeyId: string; secretAccessKey: string }
): Promise<{ success: boolean; status: string }> {
  const encryptedCredentials = encryptApiKey(JSON.stringify(credentials));
  return await redis.hsetWithStatus(`org:${orgId}`, {
    bedrock: encryptedCredentials,
  });
}

export async function getBedrockCredentials(orgId: string): Promise<{
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
} | null> {
  const encryptedCredentials = await redis.hget(`org:${orgId}`, 'bedrock');
  if (!encryptedCredentials) {
    return null;
  }
  try {
    return JSON.parse(decryptApiKey(encryptedCredentials));
  } catch {
    return null;
  }
}

export async function saveOllamaHost(
  orgId: string,
  host: string
): Promise<{ success: boolean; status: string }> {
  return await redis.hsetWithStatus(`org:${orgId}`, {
    ollama: host,
  });
}

export async function getOllamaHost(orgId: string): Promise<string | null> {
  return await redis.hget(`org:${orgId}`, 'ollama');
}

export async function saveOpenrouterAPIKey(
  orgId: string,
  apiKey: string
): Promise<{ success: boolean; status: string }> {
  const encryptedApiKey = encryptApiKey(apiKey);
  return await redis.hsetWithStatus(`org:${orgId}`, {
    openrouter: encryptedApiKey,
  });
}

export async function getOpenrouterAPIKey(
  orgId: string
): Promise<string | null> {
  const encryptedApiKey = await redis.hget(`org:${orgId}`, 'openrouter');
  if (!encryptedApiKey) {
    return null;
  }
  return decryptApiKey(encryptedApiKey);
}

export async function saveFireworksAPIKey(
  orgId: string,
  apiKey: string
): Promise<{ success: boolean; status: string }> {
  const encryptedApiKey = encryptApiKey(apiKey);
  return await redis.hsetWithStatus(`org:${orgId}`, {
    fireworks: encryptedApiKey,
  });
}

export async function getFireworksAPIKey(
  orgId: string
): Promise<string | null> {
  const encryptedApiKey = await redis.hget(`org:${orgId}`, 'fireworks');
  if (!encryptedApiKey) {
    return null;
  }
  return decryptApiKey(encryptedApiKey);
}

export async function saveAzureOpenAICredentials(
  orgId: string,
  credentials: {
    apiKey: string;
    instanceName: string;
    deploymentName: string;
    apiVersion: string;
  }
): Promise<{ success: boolean; status: string }> {
  const encryptedCredentials = encryptApiKey(JSON.stringify(credentials));
  return await redis.hsetWithStatus(`org:${orgId}`, {
    azureOpenai: encryptedCredentials,
  });
}

export async function getAzureOpenAICredentials(orgId: string): Promise<{
  apiKey: string;
  instanceName: string;
  deploymentName: string;
  apiVersion: string;
} | null> {
  const encryptedCredentials = await redis.hget(`org:${orgId}`, 'azureOpenai');
  if (!encryptedCredentials) {
    return null;
  }
  try {
    return JSON.parse(decryptApiKey(encryptedCredentials));
  } catch {
    return null;
  }
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

export async function saveVoiceId(
  orgId: string,
  voiceId: string
): Promise<{ success: boolean; status: string }> {
  return await redis.hsetWithStatus(`org:${orgId}`, {
    voiceId,
  });
}

export async function getVoiceId(orgId: string): Promise<string> {
  const voiceId = await redis.hget(`org:${orgId}`, 'voiceId');
  return voiceId ?? 'JBFqnCBsd6RMkjVDRZzb'; // default male voice
}

export async function getAllSettings(
  orgId: string
): Promise<RawOrganizationSettings> {
  const result = await redis.hgetall(`org:${orgId}`);

  const decryptedApiKey = result.openai
    ? decryptApiKey(result.openai)
    : defaultOrganizationSettings.apiKey;

  // Decrypt all provider credentials
  const anthropicApiKey = result.anthropic
    ? decryptApiKey(result.anthropic)
    : null;
  const googleApiKey = result.google ? decryptApiKey(result.google) : null;
  const openrouterApiKey = result.openrouter
    ? decryptApiKey(result.openrouter)
    : null;
  const fireworksApiKey = result.fireworks
    ? decryptApiKey(result.fireworks)
    : null;

  let bedrockCredentials = null;
  if (result.bedrock) {
    try {
      bedrockCredentials = JSON.parse(decryptApiKey(result.bedrock));
    } catch {
      bedrockCredentials = null;
    }
  }

  let azureOpenaiCredentials = null;
  if (result.azureOpenai) {
    try {
      azureOpenaiCredentials = JSON.parse(decryptApiKey(result.azureOpenai));
    } catch {
      azureOpenaiCredentials = null;
    }
  }

  return {
    apiKey: decryptedApiKey,
    anthropicApiKey,
    googleApiKey,
    bedrockCredentials,
    ollamaHost: result.ollama || null,
    openrouterApiKey,
    fireworksApiKey,
    azureOpenaiCredentials,
    model: result.model || defaultOrganizationSettings.model,
    temperature:
      result.temperature === undefined
        ? defaultOrganizationSettings.temperature
        : +result.temperature,
    prompt: result.prompt || defaultOrganizationSettings.prompt,
    maxDocumentsToRetrieve:
      +result.maxDocumentsToRetrieve ||
      defaultOrganizationSettings.maxDocumentsToRetrieve,
    voiceId: result.voiceId || 'JBFqnCBsd6RMkjVDRZzb',
  };
}
