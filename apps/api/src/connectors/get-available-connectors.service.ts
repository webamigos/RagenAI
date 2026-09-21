import { Injectable } from '@nestjs/common';
import { OrganizationSettingsService } from '../organizations/organization-settings.service.js';
import { CatalogueService } from './catalogue.service.js';
import type { ProviderDefinition } from './types.js';

/**
 * Ported from apps/web's
 * src/features/connectors/services/queries/get-available-connectors-query.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Returns the list of connector providers available to a given
 * organization, filtered by the two-tier access control:
 *   1. App-level: Settings.default_allowed_connectors (empty = all)
 *   2. Org-level: OrganizationSettings.allowedConnectors (empty = inherit app-level)
 */
@Injectable()
export class GetAvailableConnectorsService {
  constructor(
    private readonly organizationSettings: OrganizationSettingsService,
    private readonly catalogue: CatalogueService,
  ) {}

  async getAvailableConnectorsForOrg(
    orgId: string,
  ): Promise<ProviderDefinition[]> {
    const [appAllowed, orgAllowed] = await Promise.all([
      this.organizationSettings.getDefaultAllowedConnectors(),
      this.organizationSettings.getAllowedConnectors(orgId),
    ]);

    // The catalogue, not the compiled-in eleven: an entry a platform
    // administrator added has to be offered here too, and a disabled one has
    // to stop being offered — including through the public API.
    let providers = await this.catalogue.getDefinitions();

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
   * Useful for filtering connectors in queries without loading full
   * definitions.
   */
  async getAvailableConnectorProvidersForOrg(orgId: string): Promise<string[]> {
    const providers = await this.getAvailableConnectorsForOrg(orgId);
    return providers.map((p) => p.provider);
  }
}
