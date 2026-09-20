'use server';

import { getOrgIdFromAuthOrThrow } from '@/app/lib/utils/auth-helpers';
import {
  getAllowedConnectors,
  saveAllowedConnectors,
  getDefaultAllowedConnectors,
} from '@/features/organizations/services/organization-settings';
import { getConnectorDefinitionsQuery } from '@/features/connectors/services/queries/get-connector-definitions-query';
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

  // The catalogue, not the compiled-in eleven: a connector a platform
  // administrator added is offered here too, and a disabled one stops being
  // offered. Reading the manifests instead left an added connector invisible
  // on this page *and* unsaveable once it had been granted at the app level.
  const [appDefaults, orgEnabled, definitions] = await Promise.all([
    getDefaultAllowedConnectors(),
    getAllowedConnectors(orgId),
    getConnectorDefinitionsQuery(),
  ]);

  let available = definitions.map((definition) => ({
    provider: definition.provider,
    name: definition.name,
    icon: definition.iconUrl ?? '',
  }));

  if (appDefaults.length > 0) {
    available = available.filter((c) => appDefaults.includes(c.provider));
  }

  return { available, orgEnabled };
}

export async function saveOrgConnectorsAction(
  connectors: string[],
): Promise<{ success: boolean }> {
  try {
    // The session first: everything below reads the database, and none of it
    // is an anonymous caller's to reach.
    const orgId = await getOrgIdFromAuthOrThrow();

    if (
      !Array.isArray(connectors) ||
      connectors.some((c) => typeof c !== 'string')
    ) {
      logger.error('Invalid connector values in saveOrgConnectorsAction');
      return { success: false };
    }

    // Validated against the catalogue for the same reason the list above is
    // read from it: a slug an operator added is a real connector, and a
    // hard-coded set would reject it.
    const definitions = await getConnectorDefinitionsQuery();
    const validProviders = new Set(definitions.map((d) => d.provider));
    if (!connectors.every((c) => validProviders.has(c))) {
      logger.error('Invalid connector values in saveOrgConnectorsAction');
      return { success: false };
    }

    await saveAllowedConnectors(orgId, connectors);
    return { success: true };
  } catch (error) {
    logger.error({ err: error }, 'Failed to save org connectors');
    return { success: false };
  }
}
