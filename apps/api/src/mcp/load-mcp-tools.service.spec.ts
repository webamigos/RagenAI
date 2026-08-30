jest.mock('./client.js', () => ({
  createMcpToolsFromConnectors: jest.fn(),
}));
jest.mock('./provider-instructions.js', () => ({
  buildMcpContext: jest.fn().mockReturnValue('mcp context'),
}));

import { LoadMcpToolsService } from './load-mcp-tools.service.js';
import { GetEnabledConnectorsService } from '../connectors/get-enabled-connectors.service.js';
import { GetAvailableConnectorsService } from '../connectors/get-available-connectors.service.js';
import { GetProjectMcpProvidersService } from '../projects/get-project-mcp-providers.service.js';
import { SecurityEventService } from '../security/security-event.service.js';
import { createMcpToolsFromConnectors } from './client.js';

function makeService(overrides: {
  connectors?: Array<{ provider: string; [k: string]: unknown }>;
  allowedProviders?: string[];
  projectProviders?: string[];
}) {
  const getEnabledConnectors = {
    getEnabledConnectors: jest
      .fn()
      .mockResolvedValue(overrides.connectors ?? []),
  } as unknown as GetEnabledConnectorsService;
  const getAvailableConnectors = {
    getAvailableConnectorProvidersForOrg: jest
      .fn()
      .mockResolvedValue(overrides.allowedProviders ?? []),
  } as unknown as GetAvailableConnectorsService;
  const getProjectMcpProviders = {
    getProjectMcpProviders: jest
      .fn()
      .mockResolvedValue(overrides.projectProviders ?? []),
  } as unknown as GetProjectMcpProvidersService;
  const securityEvents = {
    record: jest.fn(),
  } as unknown as SecurityEventService;

  return new LoadMcpToolsService(
    getEnabledConnectors,
    getAvailableConnectors,
    getProjectMcpProviders,
    securityEvents,
  );
}

describe('LoadMcpToolsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns undefined tools when there are no enabled connectors', async () => {
    const service = makeService({ connectors: [] });

    const result = await service.loadMcpToolsForApiRequest({
      orgId: 'org-1',
      userId: 'user-1',
      projectId: 'proj-1',
    });

    expect(result.mcpTools).toBeUndefined();
    expect(result.mcpContext).toBeUndefined();
    expect(createMcpToolsFromConnectors).not.toHaveBeenCalled();
  });

  it('filters connectors by org allowlist and project allowlist before loading', async () => {
    const connectors = [
      { provider: 'CLICKUP', id: '1' },
      { provider: 'HUBSPOT', id: '2' },
    ];
    (createMcpToolsFromConnectors as jest.Mock).mockResolvedValue({
      tools: { clickup__search: {} },
      loadedProviders: ['CLICKUP'],
      closeAll: jest.fn(),
    });

    const service = makeService({
      connectors,
      allowedProviders: ['CLICKUP', 'HUBSPOT'],
      projectProviders: ['CLICKUP'],
    });

    const result = await service.loadMcpToolsForApiRequest({
      orgId: 'org-1',
      userId: 'user-1',
      projectId: 'proj-1',
    });

    expect(createMcpToolsFromConnectors).toHaveBeenCalledWith(
      [connectors[0]],
      expect.any(Function),
    );
    expect(result.mcpTools).toEqual({ clickup__search: {} });
    expect(result.mcpContext).toBe('mcp context');
  });

  it('returns a no-op closeMcpClients and swallows errors when loading fails', async () => {
    const getEnabledConnectors = {
      getEnabledConnectors: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as GetEnabledConnectorsService;
    const service = new LoadMcpToolsService(
      getEnabledConnectors,
      {} as GetAvailableConnectorsService,
      {} as GetProjectMcpProvidersService,
      { record: jest.fn() } as unknown as SecurityEventService,
    );

    const result = await service.loadMcpToolsForApiRequest({
      orgId: 'org-1',
      userId: 'user-1',
      projectId: 'proj-1',
    });

    expect(result.mcpTools).toBeUndefined();
    await expect(result.closeMcpClients()).resolves.toBeUndefined();
  });
});
