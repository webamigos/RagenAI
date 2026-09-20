import { Injectable, Logger } from '@nestjs/common';
import { connectorSlug } from '@ragenai/platform-contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { McpConnectorStatus } from '../generated/prisma/client.js';

/**
 * Ported from apps/web's
 * src/features/connectors/services/queries/get-enabled-connectors-query.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 */
@Injectable()
export class GetEnabledConnectorsService {
  private readonly logger = new Logger(GetEnabledConnectorsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getEnabledConnectors(organizationId: string, userId: string) {
    try {
      const rows = await this.prisma.client.mcpConnector.findMany({
        where: {
          organizationId,
          userId,
          enabled: true,
          status: McpConnectorStatus.CONNECTED,
        },
        select: {
          id: true,
          provider: true,
          providerSlug: true,
          mcpServerUrl: true,
          customerId: true,
          organizationId: true,
          userId: true,
        },
      });

      // The seam where the expand/contract stops being visible: downstream
      // sees one `provider`, and it is the catalogue slug. A row written by a
      // service still on the previous release has no `providerSlug`, which is
      // what the fallback inside `connectorSlug` is for.
      return rows.map((row) => ({ ...row, provider: connectorSlug(row) }));
    } catch (error) {
      this.logger.error('Error fetching enabled connectors', error);
      throw error;
    }
  }
}
