import { Injectable, Logger } from '@nestjs/common';
import { CatalogueService } from '../connectors/catalogue.service.js';
import { GetEnabledConnectorsService } from '../connectors/get-enabled-connectors.service.js';
import { GetAvailableConnectorsService } from '../connectors/get-available-connectors.service.js';
import { GetProjectMcpProvidersService } from '../projects/get-project-mcp-providers.service.js';
import { SecurityEventService } from '../security/security-event.service.js';
import { createMcpToolsFromConnectors } from './client.js';
import { buildMcpContext } from './provider-instructions.js';

export type LoadMcpToolsParams = {
  orgId: string;
  userId: string;
  /**
   * Null for a knowledge-base request. The body below already branches on it:
   * with no project, the per-project narrowing is skipped and every connector
   * the org has enabled is loaded — which makes such a request *wider* in
   * tools than any assistant-scoped one. That is the pre-existing behaviour
   * for a no-project turn, kept deliberately, and documented rather than
   * changed here.
   */
  projectId: string | null;
};

export type LoadMcpToolsResult = {
  mcpTools: Record<string, any> | undefined;
  mcpContext: string | undefined;
  closeMcpClients: () => Promise<void>;
};

/**
 * Ported from apps/web's src/app/api/v1/load-mcp-tools.ts
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
    private readonly catalogue: CatalogueService,
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

      // One resolution of the catalogue for the whole turn: the tool loader
      // and the prompt builder both need it, and it reads the database.
      const definitions = await this.catalogue.getDefinitionsBySlug();

      const { tools, loadedProviders, closeAll } =
        await createMcpToolsFromConnectors(
          connectors,
          this.securityEvents.record.bind(this.securityEvents),
          definitions,
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
        definitions,
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
