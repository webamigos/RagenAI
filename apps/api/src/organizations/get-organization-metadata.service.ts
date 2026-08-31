import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { type OrganizationMetadata } from './types.js';

/**
 * Ported from ragen-app's
 * src/features/organizations/services/queries/get-organization-metadata-query.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 */
@Injectable()
export class GetOrganizationMetadataService {
  private readonly logger = new Logger(GetOrganizationMetadataService.name);

  constructor(private readonly prisma: PrismaService) {}

  async get(organizationId: string): Promise<OrganizationMetadata> {
    try {
      const org = await this.prisma.client.organization.findUnique({
        where: { id: organizationId },
        select: {
          hasKnowledge: true,
          vectorStore: true,
        },
      });

      if (!org) {
        throw new Error(`Organization ${organizationId} not found`);
      }

      this.logger.log('Organization metadata retrieved', { organizationId });
      return {
        publicMetadata: {
          hasKnowledge: org.hasKnowledge,
        },
        vectorStore: (org.vectorStore ?? undefined) as
          OrganizationMetadata['vectorStore'] | undefined,
      };
    } catch (error) {
      this.logger.error(
        `Error: cannot get private metadata for organization ${organizationId}:`,
        { err: error },
      );
      return {
        publicMetadata: undefined,
        vectorStore: undefined,
      };
    }
  }
}
