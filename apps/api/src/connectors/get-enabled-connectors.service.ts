import { Injectable, Logger } from '@nestjs/common';
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
      return await this.prisma.client.mcpConnector.findMany({
        where: {
          organizationId,
          userId,
          enabled: true,
          status: McpConnectorStatus.CONNECTED,
        },
        select: {
          id: true,
          provider: true,
          mcpServerUrl: true,
          customerId: true,
          organizationId: true,
          userId: true,
        },
      });
    } catch (error) {
      this.logger.error('Error fetching enabled connectors', error);
      throw error;
    }
  }
}
