import { Injectable, Logger } from '@nestjs/common';
import { GetEnabledConnectorsService } from '../connectors/get-enabled-connectors.service.js';
import { GetAvailableConnectorsService } from '../connectors/get-available-connectors.service.js';
import { GetProjectMcpProvidersService } from '../projects/get-project-mcp-providers.service.js';
import { SecurityEventService } from '../security/security-event.service.js';
import { createMcpToolsFromConnectors } from './client.js';
import { buildMcpContext } from './provider-instructions.js';

export type LoadMcpToolsParams = {
  orgId: string;
  userId: string;
  projectId: string;
};

export type LoadMcpToolsResult = {
  mcpTools: Record<string, any> | undefined;
  mcpContext: string | undefined;
  closeMcpClients: () => Promise<void>;
};

/**
 * Ported from ragen-app's src/app/api/v1/load-mcp-tools.ts
 * (loadMcpToolsForApiRequest). Not yet wired into any controller — see
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 */
@Injectable()
export class LoadMcpToolsService {
  private readonly logger = new Logger(LoadMcpToolsService.name);

  constructor(
    private readonly getEnabledConnectors: GetEnabledConnectorsService,
    private readonly getAvailableConnectors: GetAvailableConnectorsService,
    private readonly getProjectMcpProviders: GetProjectMcpProvidersService,
    private readonly securityEvents: SecurityEventService,
  ) {}

  async loadMcpToolsForApiRequest({
    orgId,
    userId,
    projectId,
  }: LoadMcpToolsParams): Promise<LoadMcpToolsResult> {
    const noop = async () => {};

    try {
      let connectors = await this.getEnabledConnectors.getEnabledConnectors(
        orgId,
        userId,
      );

      const orgAllowedProviders =
        await this.getAvailableConnectors.getAvailableConnectorProvidersForOrg(
          orgId,
        );
      connectors = connectors.filter((c) =>
        orgAllowedProviders.includes(c.provider),
      );

      if (projectId && connectors.length > 0) {
        const projectMcpProviders =
          await this.getProjectMcpProviders.getProjectMcpProviders(projectId);
        connectors = connectors.filter((c) =>
          projectMcpProviders.includes(c.provider),
        );
      }

      if (connectors.length === 0) {
        return {
          mcpTools: undefined,
          mcpContext: undefined,
          closeMcpClients: noop,
        };
      }

      const { tools, loadedProviders, closeAll } =
        await createMcpToolsFromConnectors(
          connectors,
          this.securityEvents.record.bind(this.securityEvents),
        );

      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const currentDateTime = new Date().toLocaleString('en-US', {
        timeZone,
        dateStyle: 'full',
        timeStyle: 'long',
      });
      const mcpContext = buildMcpContext(
        loadedProviders,
        timeZone,
        currentDateTime,
      );

      this.logger.log('MCP tools loaded for API request', {
        toolCount: Object.keys(tools).length,
      });

      return { mcpTools: tools, mcpContext, closeMcpClients: closeAll };
    } catch (error) {
      this.logger.error(
        'Failed to load MCP tools for API request, continuing without them',
        error,
      );
      return {
        mcpTools: undefined,
        mcpContext: undefined,
        closeMcpClients: noop,
      };
    }
  }
}
