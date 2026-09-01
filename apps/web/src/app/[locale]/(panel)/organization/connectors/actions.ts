'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import {
  getAllowedConnectors,
  saveAllowedConnectors,
  getDefaultAllowedConnectors,
} from '@/features/organizations/services/organization-settings';
import { CONNECTOR_PROVIDERS } from '@/features/connectors/constants/providers';
import { PROVIDER_ICON_PATHS } from '@/features/connectors/utils/provider-icons';
import type { McpConnectorProvider } from '@/generated/prisma/client';
import { logger } from '@/app/lib/utils/logger';

export type AvailableConnectorInfo = {
  provider: string;
  name: string;
  icon: string;
};

/**
 * Returns connectors available at the app level (filtered by admin defaults)
 * plus which ones are currently enabled for this org.
 */
export async function getOrgConnectorSettingsAction(): Promise<{
  available: AvailableConnectorInfo[];
  orgEnabled: string[];
}> {
  const orgId = await getOrgIdFromAuthOrThrow();

  const [appDefaults, orgEnabled] = await Promise.all([
    getDefaultAllowedConnectors(),
    getAllowedConnectors(orgId),
  ]);

  // Filter CONNECTOR_PROVIDERS by app-level defaults
  let available = CONNECTOR_PROVIDERS.map((p) => ({
    provider: p.provider,
    name: p.name,
    icon: PROVIDER_ICON_PATHS[p.provider as McpConnectorProvider] ?? '',
  }));

  if (appDefaults.length > 0) {
    available = available.filter((c) => appDefaults.includes(c.provider));
  }

  return { available, orgEnabled };
}

const VALID_PROVIDERS = new Set<string>(
  CONNECTOR_PROVIDERS.map((p) => p.provider),
);

export async function saveOrgConnectorsAction(
  connectors: string[],
): Promise<{ success: boolean }> {
  try {
    if (
      !Array.isArray(connectors) ||
      !connectors.every((c) => typeof c === 'string' && VALID_PROVIDERS.has(c))
    ) {
      logger.error('Invalid connector values in saveOrgConnectorsAction');
      return { success: false };
    }

    const orgId = await getOrgIdFromAuthOrThrow();
    await saveAllowedConnectors(orgId, connectors);
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Failed to save org connectors');
    return { success: false };
  }
}
