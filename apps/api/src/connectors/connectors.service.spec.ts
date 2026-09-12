/* eslint-disable @typescript-eslint/unbound-method */
const mockGetProviderDefinition = jest.fn();
jest.mock('./provider-definition.js', () => ({
  getProviderDefinition: (...args: unknown[]) =>
    mockGetProviderDefinition(...args),
}));

const mockStoreToken = jest.fn();
const mockDeleteToken = jest.fn();
jest.mock('../ragen-vault/index.js', () => ({
  ragenAuthClient: {
    storeToken: (...args: unknown[]) => mockStoreToken(...args),
    deleteToken: (...args: unknown[]) => mockDeleteToken(...args),
  },
}));

const mockCreateMCPClient = jest.fn();
jest.mock('@ai-sdk/mcp', () => ({
  createMCPClient: (...args: unknown[]) => mockCreateMCPClient(...args),
}));

// The transport itself is opaque once constructed, so assert the URL and
// headers at this seam instead of reaching into its private fields.
// `isBlockedAddressError` stays real — the error mapping below depends on it.
const mockCreateGuardedMcpTransport = jest.fn();
const mockGuardedClose = jest.fn();
jest.mock('./guarded-mcp-transport.js', () => {
  const actual = jest.requireActual('./guarded-mcp-transport.js');
  return {
    ...actual,
    createGuardedMcpTransport: (...args: unknown[]) =>
      mockCreateGuardedMcpTransport(...args),
  };
});

import { ConnectorsService } from './connectors.service.js';
import { BlockedAddressError } from './guarded-fetch.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type AuditLogService } from '../audit-logs/audit-log.service.js';
import { type SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { McpConnectorStatus } from '../generated/prisma/client.js';

describe('ConnectorsService', () => {
  function makeService(overrides: {
    upsert?: jest.Mock;
    findUnique?: jest.Mock;
    delete?: jest.Mock;
    update?: jest.Mock;
    findMany?: jest.Mock;
    isFeatureEnabled?: jest.Mock;
  }) {
    const prisma = {
      client: {
        mcpConnector: {
          upsert: overrides.upsert ?? jest.fn(),
          findUnique: overrides.findUnique ?? jest.fn(),
          delete: overrides.delete ?? jest.fn(),
          update: overrides.update ?? jest.fn(),
          findMany: overrides.findMany ?? jest.fn(),
        },
      },
    } as unknown as PrismaService;
    const auditLog = { track: jest.fn() } as unknown as AuditLogService;
    const subscriptions = {
      isFeatureEnabled:
        overrides.isFeatureEnabled ?? jest.fn().mockResolvedValue(true),
    } as unknown as SubscriptionsService;
    return {
      service: new ConnectorsService(prisma, auditLog, subscriptions),
      auditLog,
    };
  }

  beforeEach(() => {
    mockGetProviderDefinition.mockReset();
    mockStoreToken.mockReset().mockResolvedValue(undefined);
    mockDeleteToken.mockReset().mockResolvedValue(undefined);
    mockCreateMCPClient.mockReset();
    mockGuardedClose.mockReset().mockResolvedValue(undefined);
    mockCreateGuardedMcpTransport.mockReset().mockReturnValue({
      transport: { __guardedTransport: true },
      close: mockGuardedClose,
    });
  });

  describe('createConnector', () => {
    it('rejects when the mcpConnectors feature is disabled', async () => {
      const { service } = makeService({
        isFeatureEnabled: jest.fn().mockResolvedValue(false),
      });

      await expect(
        service.createConnector('org-1', 'user-1', 'CLICKUP'),
      ).rejects.toThrow(/MCP connectors are not enabled/);
    });

    it('throws for an unknown provider', async () => {
      mockGetProviderDefinition.mockReturnValue(undefined);
      const { service } = makeService({});

      await expect(
        service.createConnector('org-1', 'user-1', 'CLICKUP'),
      ).rejects.toThrow(/Unknown provider/);
    });

    it('upserts the connector and audit-logs the connection', async () => {
      mockGetProviderDefinition.mockReturnValue({
        mcpServerUrl: 'https://example.com',
        authType: 'external_mcp',
      });
      const upsert = jest.fn().mockResolvedValue({
        id: 'conn-1',
        provider: 'CLICKUP',
        customerId: 'org-1:user-1:clickup',
        mcpServerUrl: 'https://example.com',
        status: McpConnectorStatus.PENDING,
      });
      const { service, auditLog } = makeService({ upsert });

      const result = await service.createConnector(
        'org-1',
        'user-1',
        'CLICKUP',
      );

      expect(result.id).toBe('conn-1');
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId_userId_provider: {
              organizationId: 'org-1',
              userId: 'user-1',
              provider: 'CLICKUP',
            },
          },
        }),
      );
      expect(auditLog.track).toHaveBeenCalledWith(
        expect.objectContaining({
          orgId: 'org-1',
          userId: 'user-1',
          action: 'connector.connected',
        }),
      );
    });

    it('appends /mcp when the base URL does not already end with it', async () => {
      mockGetProviderDefinition.mockReturnValue({
        mcpServerUrl: 'https://example.com/',
        authType: 'oauth',
      });
      const upsert = jest.fn().mockResolvedValue({});
      const { service } = makeService({ upsert });

      await service.createConnector('org-1', 'user-1', 'CLICKUP');

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            mcpServerUrl: 'https://example.com/mcp',
          }),
        }),
      );
    });
  });

  describe('disconnectConnector', () => {
    it('throws when the connector is not found', async () => {
      const { service } = makeService({
        findUnique: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.disconnectConnector('conn-1', 'org-1', 'user-1'),
      ).rejects.toThrow('Connector not found');
    });

    it('deletes the vault token and the DB row, then audit-logs it', async () => {
      const findUnique = jest
        .fn()
        .mockResolvedValue({ provider: 'CLICKUP', customerId: 'cust-1' });
      const del = jest.fn().mockResolvedValue({ id: 'conn-1' });
      const { service, auditLog } = makeService({
        findUnique,
        delete: del,
      });

      await service.disconnectConnector('conn-1', 'org-1', 'user-1');

      expect(mockDeleteToken).toHaveBeenCalledWith('cust-1', 'CLICKUP');
      expect(del).toHaveBeenCalledWith({
        where: { id: 'conn-1', organizationId: 'org-1', userId: 'user-1' },
      });
      expect(auditLog.track).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'connector.disconnected' }),
      );
    });

    it('still deletes the DB row when the vault token delete fails', async () => {
      const findUnique = jest
        .fn()
        .mockResolvedValue({ provider: 'CLICKUP', customerId: 'cust-1' });
      const del = jest.fn().mockResolvedValue({ id: 'conn-1' });
      mockDeleteToken.mockRejectedValue(new Error('vault down'));
      const { service } = makeService({ findUnique, delete: del });

      await expect(
        service.disconnectConnector('conn-1', 'org-1', 'user-1'),
      ).resolves.toEqual({ id: 'conn-1' });
    });
  });

  describe('toggleConnector', () => {
    it('scopes the update to org/user and sets enabled', async () => {
      const update = jest.fn().mockResolvedValue({ enabled: true });
      const { service } = makeService({ update });

      await service.toggleConnector('conn-1', 'org-1', 'user-1', true);

      expect(update).toHaveBeenCalledWith({
        where: { id: 'conn-1', organizationId: 'org-1', userId: 'user-1' },
        data: { enabled: true },
      });
    });
  });

  describe('markConnectorConnected', () => {
    it('sets status to CONNECTED with a connectedAt timestamp', async () => {
      const update = jest.fn().mockResolvedValue({});
      const { service } = makeService({ update });

      await service.markConnectorConnected('conn-1', 'org-1', 'user-1');

      expect(update).toHaveBeenCalledWith({
        where: { id: 'conn-1', organizationId: 'org-1', userId: 'user-1' },
        data: {
          status: McpConnectorStatus.CONNECTED,
          connectedAt: expect.any(Date),
        },
      });
    });
  });

  describe('registerApiKey', () => {
    it('rejects a provider that does not support api_key auth', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authType: 'external_mcp',
      });
      const { service } = makeService({});

      await expect(
        service.registerApiKey('org-1', 'user-1', 'CLICKUP', 'k'),
      ).rejects.toThrow(/does not support API key registration/);
    });

    it('creates the connector, registers with the external service, and marks connected', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authType: 'api_key',
        authPath: '/register',
        authBaseUrl: 'https://mcp.example.com',
        mcpServerUrl: 'https://mcp.example.com',
      });
      const upsert = jest.fn().mockResolvedValue({
        id: 'conn-1',
        customerId: 'org-1:user-1:fireflies',
      });
      const update = jest.fn().mockResolvedValue({ id: 'conn-1' });
      const { service } = makeService({ upsert, update });

      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(
          new Response(JSON.stringify({ status: 'ok' }), { status: 200 }),
        );

      const result = await service.registerApiKey(
        'org-1',
        'user-1',
        'FIREFLIES',
        'my-api-key',
      );

      expect(fetchSpy).toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: McpConnectorStatus.CONNECTED,
          }),
        }),
      );
      expect(result).toEqual({ id: 'conn-1' });
      fetchSpy.mockRestore();
    });

    it('throws when the external registration call fails', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authType: 'api_key',
        authPath: '/register',
        authBaseUrl: 'https://mcp.example.com',
        mcpServerUrl: 'https://mcp.example.com',
      });
      const upsert = jest
        .fn()
        .mockResolvedValue({ id: 'conn-1', customerId: 'cust-1' });
      const { service } = makeService({ upsert });

      const fetchSpy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue(new Response('nope', { status: 500 }));

      await expect(
        service.registerApiKey('org-1', 'user-1', 'FIREFLIES', 'k'),
      ).rejects.toThrow('Failed to register API key');
      fetchSpy.mockRestore();
    });
  });

  describe('registerApiKeyBearer', () => {
    it('rejects a provider that does not support bearer auth', async () => {
      mockGetProviderDefinition.mockReturnValue({ authType: 'oauth' });
      const { service } = makeService({});

      await expect(
        service.registerApiKeyBearer('org-1', 'user-1', 'FIREFLIES', 'k'),
      ).rejects.toThrow(/Invalid provider for API key bearer auth/);
    });

    it('stores the token in the vault and upserts a CONNECTED connector', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authType: 'api_key_bearer',
        mcpServerUrl: 'https://fireflies.example.com/mcp',
      });
      const upsert = jest.fn().mockResolvedValue({
        id: 'conn-1',
        status: McpConnectorStatus.CONNECTED,
      });
      const { service } = makeService({ upsert });

      await service.registerApiKeyBearer(
        'org-1',
        'user-1',
        'FIREFLIES',
        'my-key',
      );

      expect(mockStoreToken).toHaveBeenCalledWith(
        'org-1:user-1:fireflies',
        'FIREFLIES',
        { accessToken: 'my-key', tokenType: 'Bearer' },
      );
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            status: McpConnectorStatus.CONNECTED,
          }),
        }),
      );
    });
  });

  describe('registerApiKeyCustomHeader', () => {
    const credentials = {
      siteUrl: 'https://shop.example.com',
      consumerKey: 'ck',
      consumerSecret: 'cs',
    };

    it('rejects a provider that does not support custom-header auth', async () => {
      mockGetProviderDefinition.mockReturnValue({ authType: 'oauth' });
      const { service } = makeService({});

      await expect(
        service.registerApiKeyCustomHeader(
          'org-1',
          'user-1',
          'WOOCOMMERCE',
          credentials,
        ),
      ).rejects.toThrow(/Invalid provider for custom-header auth/);
    });

    it('rejects missing consumer key/secret', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authType: 'api_key_custom_header',
        mcpServerUrlPath: '/mcp',
        headerName: 'X-MCP-Key',
      });
      const { service } = makeService({});

      await expect(
        service.registerApiKeyCustomHeader('org-1', 'user-1', 'WOOCOMMERCE', {
          ...credentials,
          consumerKey: '',
        }),
      ).rejects.toThrow(/Consumer key and secret are required/);
    });

    it('stores the combined token and upserts the connector', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authType: 'api_key_custom_header',
        mcpServerUrlPath: '/wp-json/mcp',
        headerName: 'X-MCP-Key',
      });
      const upsert = jest.fn().mockResolvedValue({ id: 'conn-1' });
      const { service } = makeService({ upsert });

      await service.registerApiKeyCustomHeader(
        'org-1',
        'user-1',
        'WOOCOMMERCE',
        credentials,
      );

      expect(mockStoreToken).toHaveBeenCalledWith(
        'org-1:user-1:woocommerce',
        'WOOCOMMERCE',
        { accessToken: 'ck:cs', tokenType: 'CustomHeader' },
      );
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            mcpServerUrl: 'https://shop.example.com/wp-json/mcp',
          }),
        }),
      );
    });

    it('rolls back the vault token when the DB upsert fails', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authType: 'api_key_custom_header',
        mcpServerUrlPath: '/wp-json/mcp',
        headerName: 'X-MCP-Key',
      });
      const upsert = jest.fn().mockRejectedValue(new Error('DB down'));
      const { service } = makeService({ upsert });

      await expect(
        service.registerApiKeyCustomHeader(
          'org-1',
          'user-1',
          'WOOCOMMERCE',
          credentials,
        ),
      ).rejects.toThrow('DB down');

      expect(mockDeleteToken).toHaveBeenCalledWith(
        'org-1:user-1:woocommerce',
        'WOOCOMMERCE',
      );
    });

    describe('singleTokenAuth providers (e.g. Open Mercato)', () => {
      it('rejects a missing key even though no secret is required', async () => {
        mockGetProviderDefinition.mockReturnValue({
          authType: 'api_key_custom_header',
          mcpServerUrlPath: '/mcp',
          headerName: 'x-api-key',
          singleTokenAuth: true,
        });
        const { service } = makeService({});

        await expect(
          service.registerApiKeyCustomHeader(
            'org-1',
            'user-1',
            'OPEN_MERCATO',
            { siteUrl: 'https://org.example.com', consumerKey: '' },
          ),
        ).rejects.toThrow(/API key is required/);
      });

      it('stores the bare key (not joined with a secret) and upserts the connector', async () => {
        mockGetProviderDefinition.mockReturnValue({
          authType: 'api_key_custom_header',
          mcpServerUrlPath: '/mcp',
          headerName: 'x-api-key',
          singleTokenAuth: true,
        });
        const upsert = jest.fn().mockResolvedValue({ id: 'conn-1' });
        const { service } = makeService({ upsert });

        await service.registerApiKeyCustomHeader(
          'org-1',
          'user-1',
          'OPEN_MERCATO',
          { siteUrl: 'https://org.example.com', consumerKey: 'omk_abc123' },
        );

        expect(mockStoreToken).toHaveBeenCalledWith(
          'org-1:user-1:open_mercato',
          'OPEN_MERCATO',
          { accessToken: 'omk_abc123', tokenType: 'CustomHeader' },
        );
        expect(upsert).toHaveBeenCalledWith(
          expect.objectContaining({
            create: expect.objectContaining({
              mcpServerUrl: 'https://org.example.com/mcp',
            }),
          }),
        );
      });
    });
  });

  describe('testCustomHeaderConnection', () => {
    it('returns ok:false for an unsupported provider', async () => {
      mockGetProviderDefinition.mockReturnValue({ authType: 'oauth' });
      const { service } = makeService({});

      const result = await service.testCustomHeaderConnection('WOOCOMMERCE', {
        siteUrl: 'https://shop.example.com',
        consumerKey: 'a',
        consumerSecret: 'b',
      });

      expect(result).toEqual({
        ok: false,
        error: 'Provider does not support this auth type',
      });
    });

    it('returns the tool count on a successful connection', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authType: 'api_key_custom_header',
        mcpServerUrlPath: '/wp-json/mcp',
        headerName: 'X-MCP-Key',
      });
      const close = jest.fn().mockResolvedValue(undefined);
      mockCreateMCPClient.mockResolvedValue({
        tools: jest.fn().mockResolvedValue({ a: {}, b: {} }),
        close,
      });
      const { service } = makeService({});

      const result = await service.testCustomHeaderConnection('WOOCOMMERCE', {
        siteUrl: 'https://shop.example.com',
        consumerKey: 'ck',
        consumerSecret: 'cs',
      });

      expect(result).toEqual({ ok: true, toolCount: 2 });
      expect(close).toHaveBeenCalled();
      // The guarded dispatcher owns sockets, so it has to be released too.
      expect(mockGuardedClose).toHaveBeenCalled();
      expect(mockCreateGuardedMcpTransport).toHaveBeenCalledWith(
        'https://shop.example.com/wp-json/mcp',
        { 'X-MCP-Key': 'ck:cs' },
      );
    });

    it('returns a generic error when the connection fails', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authType: 'api_key_custom_header',
        mcpServerUrlPath: '/wp-json/mcp',
        headerName: 'X-MCP-Key',
      });
      mockCreateMCPClient.mockRejectedValue(new Error('upstream 500'));
      const { service } = makeService({});

      const result = await service.testCustomHeaderConnection('WOOCOMMERCE', {
        siteUrl: 'https://shop.example.com',
        consumerKey: 'ck',
        consumerSecret: 'cs',
      });

      expect(result.ok).toBe(false);
      expect(mockGuardedClose).toHaveBeenCalled();
    });

    it('says so when the site URL resolves to a private address', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authType: 'api_key_custom_header',
        mcpServerUrlPath: '/wp-json/mcp',
        headerName: 'X-MCP-Key',
      });
      // The shape fetch produces when the connect-time guard refuses.
      mockCreateMCPClient.mockRejectedValue(
        new TypeError('fetch failed', {
          cause: new BlockedAddressError('shop.example.com', '169.254.169.254'),
        }),
      );
      const { service } = makeService({});

      const result = await service.testCustomHeaderConnection('WOOCOMMERCE', {
        siteUrl: 'https://shop.example.com',
        consumerKey: 'ck',
        consumerSecret: 'cs',
      });

      expect(result).toEqual({
        ok: false,
        error:
          'The site URL resolves to a private network address, which is not allowed.',
      });
    });

    it('accepts a single key with no secret for singleTokenAuth providers', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authType: 'api_key_custom_header',
        mcpServerUrlPath: '/mcp',
        headerName: 'x-api-key',
        singleTokenAuth: true,
      });
      const close = jest.fn().mockResolvedValue(undefined);
      mockCreateMCPClient.mockResolvedValue({
        tools: jest.fn().mockResolvedValue({ search: {}, execute: {} }),
        close,
      });
      const { service } = makeService({});

      const result = await service.testCustomHeaderConnection('OPEN_MERCATO', {
        siteUrl: 'https://org.example.com',
        consumerKey: 'omk_abc123',
      });

      expect(result).toEqual({ ok: true, toolCount: 2 });
      expect(mockCreateGuardedMcpTransport).toHaveBeenCalledWith(
        'https://org.example.com/mcp',
        { 'x-api-key': 'omk_abc123' },
      );
      expect(mockCreateMCPClient).toHaveBeenCalledWith({
        transport: { __guardedTransport: true },
      });
    });

    it('rejects a missing key for singleTokenAuth providers without calling the MCP endpoint', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authType: 'api_key_custom_header',
        mcpServerUrlPath: '/mcp',
        headerName: 'x-api-key',
        singleTokenAuth: true,
      });
      const { service } = makeService({});

      const result = await service.testCustomHeaderConnection('OPEN_MERCATO', {
        siteUrl: 'https://org.example.com',
        consumerKey: '',
      });

      expect(result).toEqual({ ok: false, error: 'API key is required' });
      expect(mockCreateMCPClient).not.toHaveBeenCalled();
    });
  });

  describe('getConnector', () => {
    it('returns null when no connector row exists', async () => {
      const { service } = makeService({
        findUnique: jest.fn().mockResolvedValue(null),
      });

      const result = await service.getConnector('org-1', 'user-1', 'CLICKUP');

      expect(result).toBeNull();
    });

    it('returns null when the connector is disabled', async () => {
      const { service } = makeService({
        findUnique: jest.fn().mockResolvedValue({
          mcpServerUrl: 'https://x/mcp',
          customerId: 'cust-1',
          enabled: false,
          status: McpConnectorStatus.CONNECTED,
        }),
      });

      const result = await service.getConnector('org-1', 'user-1', 'CLICKUP');

      expect(result).toBeNull();
    });

    it('returns the lookup result, preferring authBaseUrl for baseUrl', async () => {
      mockGetProviderDefinition.mockReturnValue({
        authBaseUrl: 'https://api.example.com',
      });
      const { service } = makeService({
        findUnique: jest.fn().mockResolvedValue({
          mcpServerUrl: 'https://x.example.com/mcp',
          customerId: 'cust-1',
          enabled: true,
          status: McpConnectorStatus.CONNECTED,
        }),
      });

      const result = await service.getConnector('org-1', 'user-1', 'CLICKUP');

      expect(result).toEqual({
        mcpServerUrl: 'https://x.example.com/mcp',
        customerId: 'cust-1',
        baseUrl: 'https://api.example.com',
      });
    });
  });

  describe('getUserConnectors', () => {
    it('scopes the query to org and user, ordered by createdAt desc', async () => {
      const findMany = jest.fn().mockResolvedValue([]);
      const { service } = makeService({ findMany });

      await service.getUserConnectors('org-1', 'user-1');

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'org-1', userId: 'user-1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });
});
