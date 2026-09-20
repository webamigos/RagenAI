import { GetAvailableConnectorsService } from './get-available-connectors.service.js';
import { type OrganizationSettingsService } from '../organizations/organization-settings.service.js';
import { type CatalogueService } from './catalogue.service.js';
import { PROVIDER_LIST } from './providers/registry.js';

/**
 * The catalogue stands in for the eleven built-ins here, which is what a
 * seeded installation holds — but the point of the service taking it is that
 * an entry a platform administrator added is in this list too, and a disabled
 * one is not.
 */
function makeService(
  appAllowed: string[],
  orgAllowed: string[],
  definitions = [...PROVIDER_LIST],
) {
  const organizationSettings = {
    getDefaultAllowedConnectors: vi.fn().mockResolvedValue(appAllowed),
    getAllowedConnectors: vi.fn().mockResolvedValue(orgAllowed),
  } as unknown as OrganizationSettingsService;
  const catalogue = {
    getDefinitions: vi.fn().mockResolvedValue(definitions),
  } as unknown as CatalogueService;
  return new GetAvailableConnectorsService(organizationSettings, catalogue);
}

describe('GetAvailableConnectorsService', () => {
  it('returns every provider when neither allowlist is set', async () => {
    const service = makeService([], []);
    const result = await service.getAvailableConnectorsForOrg('org-1');
    expect(result).toHaveLength(PROVIDER_LIST.length);
  });

  it('filters by the app-level allowlist', async () => {
    const service = makeService(['CLICKUP', 'SLACK'], []);
    const result = await service.getAvailableConnectorsForOrg('org-1');
    expect(result.map((p) => p.provider).sort()).toEqual(
      ['CLICKUP', 'SLACK'].sort(),
    );
  });

  it('further filters by the org-level allowlist', async () => {
    const service = makeService(['CLICKUP', 'SLACK', 'HUBSPOT'], ['SLACK']);
    const result = await service.getAvailableConnectorsForOrg('org-1');
    expect(result.map((p) => p.provider)).toEqual(['SLACK']);
  });

  it('getAvailableConnectorProvidersForOrg returns just the provider ids', async () => {
    const service = makeService([], ['CLICKUP']);
    const result = await service.getAvailableConnectorProvidersForOrg('org-1');
    expect(result).toEqual(['CLICKUP']);
  });

  it('offers an entry the catalogue carries and no manifest describes', async () => {
    // The whole point of the catalogue reaching this app: a connector added
    // from the admin panel has no manifest here, and has to be offered anyway.
    const notion = {
      provider: 'notion',
      name: 'Notion',
      description: 'Search pages.',
      icon: 'notebook',
      mcpServerUrl: 'https://mcp.notion.com/mcp',
      authType: 'api_key_bearer' as const,
    };
    const service = makeService([], [], [notion]);

    expect(await service.getAvailableConnectorProvidersForOrg('org-1')).toEqual(
      ['notion'],
    );
  });
});
