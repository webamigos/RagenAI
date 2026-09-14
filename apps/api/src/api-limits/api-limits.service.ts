import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrganizationSettingsService } from '../organizations/organization-settings.service.js';

export type ApiLimitStatus = {
  exceeded: boolean;
  current: number;
  limit: number | null;
};

export type UsageCeilingDimension = 'tokens' | 'cost' | 'messages';

export type UsageCeilingStatus = {
  exceeded: UsageCeilingDimension[];
  current: {
    totalTokens: number;
    totalCostCents: number;
    totalMessages: number;
  };
  limits: {
    monthlyTokenLimit: number | null;
    monthlyCostLimitCents: number | null;
    monthlyMessageLimit: number | null;
  };
};

function getMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Ported from apps/web's src/app/api/v1/check-api-limit.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md.
 */
@Injectable()
export class ApiLimitsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly organizationSettings: OrganizationSettingsService,
  ) {}

  /**
   * The monthly token, cost and message ceilings.
   *
   * The apps/web counterpart is
   * `features/ai-usage/services/queries/check-usage-limits-query.ts`; the two
   * have to agree, and the parts that are easy to get wrong are written down in
   * both places:
   *
   * - **Spend aggregates over every step.** Embeddings and reranking cost
   *   money, so they count toward tokens and cost.
   * - **The message ceiling counts chat turns only.** One document ingest
   *   writes a row per embedded chunk, and the admin panel suggests 500 for
   *   this ceiling — counting every row would refuse requests because somebody
   *   uploaded a PDF.
   * - **The API request quota is not here.** It is `checkApiRequestLimit`,
   *   above, which every caller of this already calls.
   */
  async checkUsageCeilings(
    organizationId: string,
  ): Promise<UsageCeilingStatus> {
    const monthStart = getMonthStart();

    const [limits, aggregates, chatMessageCount] = await Promise.all([
      this.organizationSettings.getUsageLimits(organizationId),
      this.prisma.client.aiUsage.aggregate({
        where: { organizationId, createdAt: { gte: monthStart } },
        _sum: { totalTokens: true, estimatedCost: true },
      }),
      this.prisma.client.aiUsage.count({
        where: {
          organizationId,
          createdAt: { gte: monthStart },
          step: 'CHAT_COMPLETION',
        },
      }),
    ]);

    const totalTokens = aggregates._sum.totalTokens ?? 0;
    const totalCostCents = Math.round(
      (aggregates._sum.estimatedCost ?? 0) * 100,
    );

    const exceeded: UsageCeilingDimension[] = [];
    if (
      limits.monthlyTokenLimit !== null &&
      totalTokens >= limits.monthlyTokenLimit
    ) {
      exceeded.push('tokens');
    }
    if (
      limits.monthlyCostLimitCents !== null &&
      totalCostCents >= limits.monthlyCostLimitCents
    ) {
      exceeded.push('cost');
    }
    if (
      limits.monthlyMessageLimit !== null &&
      chatMessageCount >= limits.monthlyMessageLimit
    ) {
      exceeded.push('messages');
    }

    return {
      exceeded,
      current: {
        totalTokens,
        totalCostCents,
        totalMessages: chatMessageCount,
      },
      limits: {
        monthlyTokenLimit: limits.monthlyTokenLimit,
        monthlyCostLimitCents: limits.monthlyCostLimitCents,
        monthlyMessageLimit: limits.monthlyMessageLimit,
      },
    };
  }

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
