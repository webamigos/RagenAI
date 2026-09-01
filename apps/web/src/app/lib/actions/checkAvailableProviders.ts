'use server';

import {
  type ModelProvider,
  availableModels,
  type AvailableModel,
} from '../../components/config';
import { getAllowedModels } from '@/features/organizations/services/organization-settings';
import { fetchLiteLLMModels } from '@/libs/litellm/client';

type ProviderStatus = {
  provider: ModelProvider;
  available: boolean;
  source: 'environment';
};

export async function checkAvailableProviders(
  _orgId: string,
): Promise<ProviderStatus[]> {
  return [
    {
      provider: 'litellm',
      available: !!process.env.LITELLM_PROXY_URL,
      source: 'environment',
    },
  ];
}

export async function getAvailableModelsForOrganization(
  orgId: string,
): Promise<AvailableModel[]> {
  const allowedModels = await getAllowedModels(orgId);

  // Fetch models dynamically from LiteLLM proxy
  let models: AvailableModel[];
  try {
    const litellmModels = await fetchLiteLLMModels();
    models = litellmModels.length > 0 ? litellmModels : [...availableModels];
  } catch {
    models = [...availableModels];
  }

  if (allowedModels.length > 0) {
    models = models.filter((model) => allowedModels.includes(model.value));
  }

  return models;
}
