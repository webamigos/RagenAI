import {
  getAllowedConnectors,
  getDefaultAllowedConnectors,
} from '@/features/organizations/services/organization-settings';
import { CONNECTOR_PROVIDERS } from '../../constants/providers';
import type { ProviderDefinition } from '../../contracts/connector.types';

/**
 * Returns the list of connector providers available to a given organization,
 * filtered by the two-tier access control:
 *   1. App-level: Settings.default_allowed_connectors (empty = all)
 *   2. Org-level: OrganizationSettings.allowedConnectors (empty = inherit app-level)
 */
export async function getAvailableConnectorsForOrg(
  orgId: string,
): Promise<ProviderDefinition[]> {
  const [appAllowed, orgAllowed] = await Promise.all([
    getDefaultAllowedConnectors(),
    getAllowedConnectors(orgId),
  ]);

  let providers = [...CONNECTOR_PROVIDERS];

  if (appAllowed.length > 0) {
    providers = providers.filter((p) => appAllowed.includes(p.provider));
  }

  if (orgAllowed.length > 0) {
    providers = providers.filter((p) => orgAllowed.includes(p.provider));
  }

  return providers;
}

/**
 * Returns the provider enum values available to a given organization.
 * Useful for filtering connectors in queries without loading full definitions.
 */
export async function getAvailableConnectorProvidersForOrg(
  orgId: string,
): Promise<string[]> {
  const providers = await getAvailableConnectorsForOrg(orgId);
  return providers.map((p) => p.provider);
}
