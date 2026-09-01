import { GetAvailableConnectorsService } from './get-available-connectors.service.js';
import { type OrganizationSettingsService } from '../organizations/organization-settings.service.js';
import { PROVIDER_LIST } from './providers/registry.js';

function makeService(appAllowed: string[], orgAllowed: string[]) {
  const organizationSettings = {
    getDefaultAllowedConnectors: jest.fn().mockResolvedValue(appAllowed),
    getAllowedConnectors: jest.fn().mockResolvedValue(orgAllowed),
  } as unknown as OrganizationSettingsService;
  return new GetAvailableConnectorsService(organizationSettings);
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
});
