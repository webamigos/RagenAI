'use server';

import {
  type ModelProvider,
  availableModels,
  type AvailableModel,
} from '../../components/config';
import { getAllowedModels } from '@/features/organizations/services/organization-settings';
import { gatewayFromEnv } from '@ragenai/llm-gateway';
import { logger } from '@/app/lib/utils/logger';

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

/**
 * The models this deployment can actually answer with, under the gateway.
 *
 * `serves()` is credential-aware on purpose: the shipped route table describes
 * Ragen's own installation, so a deployment holding one provider's credentials
 * has routes it cannot honour. Offering those in the picker turns the first
 * click into a credentials error — which is exactly what `LLM_GATEWAY=native`
 * used to do, because this function asked the *proxy* what it served whatever
 * the flag said, and the proxy's credentials are not the app processes'.
 *
 * Falls back to the full catalogue rather than an empty picker if the route
 * table cannot be read: an empty model list is indistinguishable from "this
 * product is broken", and the call itself still fails loudly per model.
 */
function gatewayModels(): AvailableModel[] {
  try {
    const gateway = gatewayFromEnv();
    const served = new Set(gateway.availableModels());
    const offered = availableModels.filter((model) => served.has(model.value));

    if (offered.length === 0) {
      logger.warn(
        { served: served.size },
        'Gateway serves no model the picker knows about — falling back to the full catalogue',
      );
      return [...availableModels];
    }
    return offered;
  } catch (error) {
    logger.warn(
      { err: error },
      'Could not read the gateway route table — falling back to the full catalogue',
    );
    return [...availableModels];
  }
}

export async function getAvailableModelsForOrganization(
  orgId: string,
): Promise<AvailableModel[]> {
  const allowedModels = await getAllowedModels(orgId);

  // From the route table, which is credential-aware: a provider this
  // deployment holds no keys for contributes nothing, rather than appearing in
  // the picker and failing on the first click.
  let models: AvailableModel[] = gatewayModels();

  if (allowedModels.length > 0) {
    models = models.filter((model) => allowedModels.includes(model.value));
  }

  return models;
}
