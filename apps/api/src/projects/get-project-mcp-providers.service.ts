import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Ported from apps/web's
 * src/features/projects/services/queries/get-project-mcp-providers-query.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 */
@Injectable()
export class GetProjectMcpProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async getProjectMcpProviders(
    projectId: string,
    organizationId?: string,
  ): Promise<string[]> {
    if (organizationId) {
      const project = await this.prisma.client.project.findFirst({
        where: { id: projectId, organizationId },
        select: { id: true },
      });
      if (!project) {
        return [];
      }
    }

    const settings = await this.prisma.client.projectSettings.findUnique({
      where: { projectId },
      select: { enabledMcpProviders: true },
    });

    return settings?.enabledMcpProviders ?? [];
  }
}
