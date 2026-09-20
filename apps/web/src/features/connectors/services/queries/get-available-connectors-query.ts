import {
  getAllowedConnectors,
  getDefaultAllowedConnectors,
} from '@/features/organizations/services/organization-settings';
import type { ProviderDefinition } from '../../contracts/connector.types';
import { getConnectorDefinitionsQuery } from './get-connector-definitions-query';

/**
 * The connectors available to an organization: the catalogue, filtered by the
 * two-tier access control:
 *   1. App-level: Settings.default_allowed_connectors (empty = all)
 *   2. Org-level: OrganizationSettings.allowedConnectors (empty = inherit app-level)
 *
 * The catalogue is rows since B4, so an entry a platform administrator adds
 * appears here without a deploy — which is the whole feature. A disabled entry
 * never reaches this list: `getCatalogEntriesQuery` filters it out, so nobody
 * is offered a connector the installation has switched off.
 */
export async function getAvailableConnectorsForOrg(
  orgId: string,
): Promise<ProviderDefinition[]> {
  const [appAllowed, orgAllowed] = await Promise.all([
    getDefaultAllowedConnectors(),
    getAllowedConnectors(orgId),
  ]);

  let providers = await getConnectorDefinitionsQuery();

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
