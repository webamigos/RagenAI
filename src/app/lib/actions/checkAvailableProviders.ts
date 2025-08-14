'use server';

import { auth } from '@clerk/nextjs/server';
import {
  ModelProvider,
  availableModels,
  AvailableModel,
} from '../../components/config';
import {
  getOpenaiAPIKey,
  getAnthropicAPIKey,
  getGoogleAPIKey,
  getBedrockCredentials,
  getOllamaHost,
  getOpenrouterAPIKey,
  getFireworksAPIKey,
  getAzureOpenAICredentials,
} from '../services/settings';

const providerStatusCache = new Map<
  string,
  { data: ProviderStatus[]; timestamp: number }
>();
const CACHE_TTL = 30000;

type ProviderStatus = {
  provider: ModelProvider;
  available: boolean;
  source: 'organization' | 'environment' | 'both';
};

export async function checkAvailableProviders(): Promise<ProviderStatus[]> {
  const { orgId } = auth();

  if (!orgId) {
    throw new Error('Organization ID is required');
  }

  const cacheKey = orgId;
  const cached = providerStatusCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const providers: ModelProvider[] = [
    'openai',
    'google',
    'anthropic',
    'bedrock',
    'ollama',
    'openrouter',
    'fireworks',
    'azure-openai',
  ];

  const providerStatuses: ProviderStatus[] = [];

  for (const provider of providers) {
    let hasOrganizationCredentials = false;
    let hasEnvironmentCredentials = false;

    switch (provider) {
      case 'openai':
        const openaiKey = await getOpenaiAPIKey(orgId);
        hasOrganizationCredentials = !!openaiKey;
        break;
      case 'anthropic':
        const anthropicKey = await getAnthropicAPIKey(orgId);
        hasOrganizationCredentials = !!anthropicKey;
        break;
      case 'google':
        const googleKey = await getGoogleAPIKey(orgId);
        hasOrganizationCredentials = !!googleKey;
        break;
      case 'bedrock':
        const bedrockCreds = await getBedrockCredentials(orgId);
        hasOrganizationCredentials = !!bedrockCreds;
        break;
      case 'ollama':
        const ollamaHost = await getOllamaHost(orgId);
        hasOrganizationCredentials = !!ollamaHost;
        break;
      case 'openrouter':
        const openrouterKey = await getOpenrouterAPIKey(orgId);
        hasOrganizationCredentials = !!openrouterKey;
        break;
      case 'fireworks':
        const fireworksKey = await getFireworksAPIKey(orgId);
        hasOrganizationCredentials = !!fireworksKey;
        break;
      case 'azure-openai':
        const azureCreds = await getAzureOpenAICredentials(orgId);
        hasOrganizationCredentials = !!azureCreds;
        break;
    }

    switch (provider) {
      case 'openai':
        hasEnvironmentCredentials = !!process.env.OPENAI_API_KEY;
        break;
      case 'anthropic':
        hasEnvironmentCredentials = !!process.env.ANTHROPIC_API_KEY;
        break;
      case 'google':
        hasEnvironmentCredentials = !!process.env.GOOGLE_API_KEY;
        break;
      case 'bedrock':
        hasEnvironmentCredentials = !!(
          process.env.AWS_REGION &&
          process.env.AWS_ACCESS_KEY_ID &&
          process.env.AWS_SECRET_ACCESS_KEY
        );
        break;
      case 'ollama':
        hasEnvironmentCredentials = !!process.env.OLLAMA_HOST;
        break;
      case 'openrouter':
        hasEnvironmentCredentials = !!process.env.OPENROUTER_API_KEY;
        break;
      case 'fireworks':
        hasEnvironmentCredentials = !!process.env.FIREWORKS_API_KEY;
        break;
      case 'azure-openai':
        hasEnvironmentCredentials = !!(
          process.env.AZURE_OPENAI_KEY &&
          process.env.AZURE_OPENAI_INSTANCE &&
          process.env.AZURE_OPENAI_DEPLOYMENT &&
          process.env.AZURE_OPENAI_VERSION
        );
        break;
    }

    const available = hasOrganizationCredentials || hasEnvironmentCredentials;
    let source: 'organization' | 'environment' | 'both' = 'environment';

    if (hasOrganizationCredentials && hasEnvironmentCredentials) {
      source = 'both';
    } else if (hasOrganizationCredentials) {
      source = 'organization';
    }

    providerStatuses.push({
      provider,
      available,
      source,
    });
  }

  providerStatusCache.set(cacheKey, {
    data: providerStatuses,
    timestamp: Date.now(),
  });

  return providerStatuses;
}

export async function getAvailableModelsForOrganization(): Promise<
  AvailableModel[]
> {
  const providerStatuses = await checkAvailableProviders();
  const availableProviders = providerStatuses
    .filter((status) => status.available)
    .map((status) => status.provider);

  return availableModels.filter((model) =>
    availableProviders.includes(model.provider)
  );
}
