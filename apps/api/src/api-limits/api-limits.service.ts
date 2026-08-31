import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrganizationSettingsService } from '../organizations/organization-settings.service.js';

export type ApiLimitStatus = {
  exceeded: boolean;
  current: number;
  limit: number | null;
};

function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Ported from ragen-app's src/app/api/v1/check-api-limit.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 */
@Injectable()
export class ApiLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationSettings: OrganizationSettingsService,
  ) {}

  async checkApiRequestLimit(organizationId: string): Promise<ApiLimitStatus> {
    const limits =
      await this.organizationSettings.getUsageLimits(organizationId);

    if (limits.monthlyApiRequestLimit === null) {
      return { exceeded: false, current: 0, limit: null };
    }

    const count = await this.prisma.client.aiUsage.count({
      where: {
        organizationId,
        createdAt: { gte: getMonthStart() },
        step: 'CHAT_COMPLETION',
        metadata: {
          path: ['source'],
          equals: 'API',
        },
      },
    });

    return {
      exceeded: count >= limits.monthlyApiRequestLimit,
      current: count,
      limit: limits.monthlyApiRequestLimit,
    };
  }
}
