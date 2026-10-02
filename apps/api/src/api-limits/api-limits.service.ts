import { Injectable } from '@nestjs/common';
import {
  CHAT_TURN_STEP,
  evaluateCeilings,
  usageMonthStart,
  type CeilingDimension,
} from '@ragenai/platform-contracts';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrganizationSettingsService } from '../organizations/organization-settings.service.js';

export type ApiLimitStatus = {
  exceeded: boolean;
  current: number;
  limit: number | null;
};

export type UsageCeilingDimension = CeilingDimension;

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
   * The arithmetic is `evaluateCeilings` in `@ragenai/platform-contracts`,
   * shared with apps/web's `check-usage-limits-query.ts` and the worker; this
   * keeps only the Prisma read. The parts that are easy to get wrong:
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
    const monthStart = usageMonthStart();

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
          step: CHAT_TURN_STEP,
        },
      }),
    ]);

    const { exceeded, current } = evaluateCeilings(limits, {
      totalTokens: aggregates._sum.totalTokens,
      totalCostDollars: aggregates._sum.estimatedCost,
      chatMessages: chatMessageCount,
    });

    return {
      exceeded,
      current,
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
        createdAt: { gte: usageMonthStart() },
        step: CHAT_TURN_STEP,
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
