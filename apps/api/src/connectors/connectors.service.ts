import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { createMCPClient } from '@ai-sdk/mcp';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditLogService } from '../audit-logs/audit-log.service.js';
import { SubscriptionsService } from '../subscriptions/subscriptions.service.js';
import { ragenAuthClient } from '../ragen-vault/index.js';
import { getProviderDefinition } from './provider-definition.js';
import { fetchWithTimeout } from './fetch-with-timeout.js';
import { normalizeSiteUrl } from './site-url.js';
import {
  McpConnectorStatus,
  type McpConnectorProvider,
} from '../generated/prisma/client.js';
import { type ConnectorDto, type CustomHeaderCredentials } from './types.js';

export type ConnectorLookupResult = {
  mcpServerUrl: string;
  customerId: string;
  baseUrl: string;
} | null;

export type TestConnectionResult =
  { ok: true; toolCount: number } | { ok: false; error: string };

/**
 * Ported from ragen-app's src/features/connectors/services/{commands,
 * queries}/*.ts — the "core" connector lifecycle only (connect via API
 * key/bearer/custom-header, disconnect, toggle, mark-connected, listing
 * queries). See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * NOT ported: Google Drive folder import/sync and Fireflies transcript
 * search — both need Temporal workflow orchestration and/or S3 upload,
 * neither of which exists anywhere in apps/api yet. Deferred to their own
 * future slice.
 *
 * `trackAudit`/`isFeatureEnabledQuery` (session-derived context in
 * ragen-app) are now the already-ported `AuditLogService`/
 * `SubscriptionsService`, called with explicit orgId/userId from this
 * service's own params — same pattern as every prior Phase C slice.
 * `ragenAuthClient` is used directly (it's already a lazy singleton, not
 * NestJS DI, matching how ragen-app itself uses it as a plain import).
 * `UnauthorizedException`/`NotFoundException` use `@nestjs/common`'s
 * built-ins instead of ragen-app's custom `src/libs/utils/errors.ts`.
 */
@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLog: AuditLogService,
    private readonly subscriptions: SubscriptionsService,
  ) {}

  async createConnector(
    organizationId: string,
    userId: string,
    provider: McpConnectorProvider,
  ) {
    const canConnect = await this.subscriptions.isFeatureEnabled(
      organizationId,
      'mcpConnectors',
    );
    if (!canConnect) {
      throw new UnauthorizedException(
        'MCP connectors are not enabled for your organization plan',
      );
    }

    const providerDef = getProviderDefinition(provider);
    if (!providerDef) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const customerId = `${organizationId}:${userId}:${provider.toLowerCase()}`;
    const baseUrl = providerDef.mcpServerUrl.replace(/\/+$/, '');
    let mcpServerUrl: string;
    if (
      providerDef.authType === 'external_mcp' ||
      providerDef.authType === 'api_key_bearer'
    ) {
      mcpServerUrl = baseUrl;
    } else if (baseUrl.endsWith('/mcp')) {
      mcpServerUrl = baseUrl;
    } else {
      mcpServerUrl = `${baseUrl}/mcp`;
    }

    try {
      const connector = await this.prisma.client.mcpConnector.upsert({
        where: {
          organizationId_userId_provider: {
            organizationId,
            userId,
            provider,
          },
        },
        update: {
          status: McpConnectorStatus.PENDING,
          mcpServerUrl,
          customerId,
        },
        create: {
          organizationId,
          userId,
          provider,
          mcpServerUrl,
          customerId,
          status: McpConnectorStatus.PENDING,
        },
        select: {
          id: true,
          provider: true,
          customerId: true,
          mcpServerUrl: true,
          status: true,
        },
      });

      this.auditLog.track({
        orgId: organizationId,
        userId,
        action: 'connector.connected',
        entityType: 'connector',
        entityId: connector.id,
        newData: { provider: connector.provider },
      });

      return connector;
    } catch (error) {
      this.logger.error('Error creating connector', error);
      throw error;
    }
  }

  async disconnectConnector(
    connectorId: string,
    organizationId: string,
    userId: string,
  ) {
    try {
      const connector = await this.prisma.client.mcpConnector.findUnique({
        where: { id: connectorId, organizationId, userId },
        select: { provider: true, customerId: true },
      });

      if (!connector) {
        throw new Error('Connector not found');
      }

      try {
        await ragenAuthClient.deleteToken(
          connector.customerId,
          connector.provider,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to delete token from ragen-vault (may not exist), provider=${connector.provider}`,
          error,
        );
      }

      const deleted = await this.prisma.client.mcpConnector.delete({
        where: { id: connectorId, organizationId, userId },
      });

      this.auditLog.track({
        orgId: organizationId,
        userId,
        action: 'connector.disconnected',
        entityType: 'connector',
        entityId: connectorId,
        oldData: { provider: connector.provider },
      });

      return deleted;
    } catch (error) {
      this.logger.error('Error disconnecting connector', error);
      throw error;
    }
  }

  async toggleConnector(
    connectorId: string,
    organizationId: string,
    userId: string,
    enabled: boolean,
  ) {
    try {
      return await this.prisma.client.mcpConnector.update({
        where: { id: connectorId, organizationId, userId },
        data: { enabled },
      });
    } catch (error) {
      this.logger.error('Error toggling connector', error);
      throw error;
    }
  }

  async markConnectorConnected(
    connectorId: string,
    organizationId: string,
    userId: string,
  ) {
    try {
      return await this.prisma.client.mcpConnector.update({
        where: { id: connectorId, organizationId, userId },
        data: {
          status: McpConnectorStatus.CONNECTED,
          connectedAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Error marking connector as connected', error);
      throw error;
    }
  }

  /**
   * Register an API key with the external MCP service, then mark the
   * connector as connected. Used for providers that use API key auth
   * instead of OAuth (e.g. Fireflies).
   */
  async registerApiKey(
    organizationId: string,
    userId: string,
    provider: McpConnectorProvider,
    apiKey: string,
  ) {
    const providerDef = getProviderDefinition(provider);
    if (
      !providerDef ||
      providerDef.authType !== 'api_key' ||
      !providerDef.authPath ||
      (!providerDef.authBaseUrl && !providerDef.mcpServerUrl)
    ) {
      throw new Error(
        `Provider does not support API key registration: ${provider}`,
      );
    }

    const connector = await this.createConnector(
      organizationId,
      userId,
      provider,
    );

    try {
      const baseUrl = providerDef.authBaseUrl || providerDef.mcpServerUrl;
      const url = new URL(
        providerDef.authPath,
        baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
      );

      const response = await fetchWithTimeout(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId: connector.customerId,
          api_key: apiKey,
        }),
      });

      if (!response.ok) {
        this.logger.error(
          `API key registration failed, status=${response.status}, provider=${provider}`,
        );
        throw new Error('Failed to register API key');
      }

      const data = (await response.json()) as {
        status?: string;
        message?: string;
      };
      if (data.status !== 'ok') {
        throw new Error(data.message || 'Failed to register API key');
      }
    } catch (error) {
      this.logger.error(
        `Error registering API key, provider=${provider}`,
        error,
      );
      throw error;
    }

    return this.markConnectorConnected(connector.id, organizationId, userId);
  }

  /**
   * Store an API key as a Bearer token for direct MCP server auth. Used
   * for providers like Fireflies where OAuth doesn't give proper data
   * access but the API key works as a Bearer token against their MCP
   * server.
   */
  async registerApiKeyBearer(
    organizationId: string,
    userId: string,
    provider: McpConnectorProvider,
    apiKey: string,
  ) {
    const providerDef = getProviderDefinition(provider);
    if (!providerDef || providerDef.authType !== 'api_key_bearer') {
      throw new Error(`Invalid provider for API key bearer auth: ${provider}`);
    }

    const customerId = `${organizationId}:${userId}:${provider.toLowerCase()}`;

    try {
      await ragenAuthClient.storeToken(customerId, provider, {
        accessToken: apiKey,
        tokenType: 'Bearer',
      });

      return await this.prisma.client.mcpConnector.upsert({
        where: {
          organizationId_userId_provider: {
            organizationId,
            userId,
            provider,
          },
        },
        update: {
          status: McpConnectorStatus.CONNECTED,
          mcpServerUrl: providerDef.mcpServerUrl,
          customerId,
          connectedAt: new Date(),
        },
        create: {
          organizationId,
          userId,
          provider,
          mcpServerUrl: providerDef.mcpServerUrl,
          customerId,
          status: McpConnectorStatus.CONNECTED,
          connectedAt: new Date(),
        },
        select: { id: true, status: true, connectedAt: true },
      });
    } catch (error) {
      this.logger.error(
        `Error registering API key bearer, provider=${provider}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Register a connector that authenticates via a custom HTTP header with
   * a user-supplied site URL and two-part credential (consumer key +
   * secret). Vault write happens before the DB upsert so the DB row never
   * points to a vault entry that doesn't exist; on DB failure the vault
   * write is best-effort rolled back.
   */
  async registerApiKeyCustomHeader(
    organizationId: string,
    userId: string,
    provider: McpConnectorProvider,
    credentials: CustomHeaderCredentials,
  ) {
    const providerDef = getProviderDefinition(provider);
    if (
      !providerDef ||
      providerDef.authType !== 'api_key_custom_header' ||
      !providerDef.mcpServerUrlPath ||
      !providerDef.headerName
    ) {
      throw new Error(`Invalid provider for custom-header auth: ${provider}`);
    }

    const siteUrl = normalizeSiteUrl(credentials.siteUrl);
    const consumerKey = credentials.consumerKey?.trim() ?? '';
    const consumerSecret = credentials.consumerSecret?.trim() ?? '';

    if (!consumerKey || !consumerSecret) {
      throw new Error('Consumer key and secret are required');
    }

    const mcpServerUrl = `${siteUrl}${providerDef.mcpServerUrlPath}`;
    const customerId = `${organizationId}:${userId}:${provider.toLowerCase()}`;
    const combinedToken = `${consumerKey}:${consumerSecret}`;

    await ragenAuthClient.storeToken(customerId, provider, {
      accessToken: combinedToken,
      tokenType: 'CustomHeader',
    });

    try {
      return await this.prisma.client.mcpConnector.upsert({
        where: {
          organizationId_userId_provider: {
            organizationId,
            userId,
            provider,
          },
        },
        update: {
          status: McpConnectorStatus.CONNECTED,
          mcpServerUrl,
          customerId,
          connectedAt: new Date(),
        },
        create: {
          organizationId,
          userId,
          provider,
          mcpServerUrl,
          customerId,
          status: McpConnectorStatus.CONNECTED,
          connectedAt: new Date(),
        },
        select: { id: true, status: true, connectedAt: true },
      });
    } catch (error) {
      this.logger.error(
        `Error registering custom-header connector; rolling back vault token, provider=${provider}`,
        error,
      );
      try {
        await ragenAuthClient.deleteToken(customerId, provider);
      } catch (cleanupErr) {
        this.logger.warn(
          `Failed to roll back vault token after connector upsert failure, provider=${provider}, customerId=${customerId}`,
          cleanupErr,
        );
      }
      throw error;
    }
  }

  /**
   * Validate custom-header credentials against the live MCP endpoint
   * without persisting anything. Failure messages are deliberately
   * generic so we don't leak upstream error shapes to the client.
   */
  async testCustomHeaderConnection(
    provider: McpConnectorProvider,
    credentials: CustomHeaderCredentials,
  ): Promise<TestConnectionResult> {
    const providerDef = getProviderDefinition(provider);
    if (
      !providerDef ||
      providerDef.authType !== 'api_key_custom_header' ||
      !providerDef.mcpServerUrlPath ||
      !providerDef.headerName
    ) {
      return { ok: false, error: 'Provider does not support this auth type' };
    }

    let siteUrl: string;
    try {
      siteUrl = normalizeSiteUrl(credentials.siteUrl);
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }

    const consumerKey = credentials.consumerKey?.trim() ?? '';
    const consumerSecret = credentials.consumerSecret?.trim() ?? '';
    if (!consumerKey || !consumerSecret) {
      return { ok: false, error: 'Consumer key and secret are required' };
    }

    const mcpServerUrl = `${siteUrl}${providerDef.mcpServerUrlPath}`;
    const combinedToken = `${consumerKey}:${consumerSecret}`;

    let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;
    try {
      client = await createMCPClient({
        transport: {
          type: 'http',
          url: mcpServerUrl,
          headers: {
            [providerDef.headerName]: combinedToken,
          },
        },
      });

      const tools = await client.tools();
      return { ok: true, toolCount: Object.keys(tools).length };
    } catch (error) {
      this.logger.warn(
        `Custom-header connection test failed, provider=${provider}, mcpServerUrl=${mcpServerUrl}`,
        error,
      );
      return {
        ok: false,
        error:
          'Could not connect to the MCP endpoint. Check the site URL and credentials.',
      };
    } finally {
      if (client) {
        try {
          await client.close();
        } catch (closeErr) {
          this.logger.warn('Failed to close MCP test client', closeErr);
        }
      }
    }
  }

  async getConnector(
    organizationId: string,
    userId: string,
    provider: McpConnectorProvider,
  ): Promise<ConnectorLookupResult> {
    const connector = await this.prisma.client.mcpConnector.findUnique({
      where: {
        organizationId_userId_provider: { organizationId, userId, provider },
      },
      select: {
        mcpServerUrl: true,
        customerId: true,
        enabled: true,
        status: true,
      },
    });

    if (
      !connector ||
      connector.status !== McpConnectorStatus.CONNECTED ||
      !connector.enabled ||
      !connector.mcpServerUrl ||
      !connector.customerId
    ) {
      return null;
    }

    const providerDef = getProviderDefinition(provider);
    const baseUrl =
      providerDef?.authBaseUrl || connector.mcpServerUrl.replace(/\/mcp$/, '');

    return {
      mcpServerUrl: connector.mcpServerUrl,
      customerId: connector.customerId,
      baseUrl,
    };
  }

  async getUserConnectors(
    organizationId: string,
    userId: string,
  ): Promise<ConnectorDto[]> {
    try {
      return await this.prisma.client.mcpConnector.findMany({
        where: { organizationId, userId },
        select: {
          id: true,
          provider: true,
          mcpServerUrl: true,
          customerId: true,
          enabled: true,
          status: true,
          connectedAt: true,
          createdAt: true,
          lastError: true,
          lastErrorAt: true,
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      this.logger.error('Error fetching connectors for user', error);
      throw error;
    }
  }
}
