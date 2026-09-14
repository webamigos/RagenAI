import { ApiLimitsService } from './api-limits.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';
import { type OrganizationSettingsService } from '../organizations/organization-settings.service.js';

describe('ApiLimitsService', () => {
  function makeService(monthlyApiRequestLimit: number | null) {
    const count = jest.fn();
    const prisma = {
      client: { aiUsage: { count } },
    } as unknown as PrismaService;
    const organizationSettings = {
      getUsageLimits: jest.fn().mockResolvedValue({
        monthlyTokenLimit: null,
        monthlyCostLimitCents: null,
        monthlyMessageLimit: null,
        monthlyApiRequestLimit,
        maxMembers: null,
      }),
    } as unknown as OrganizationSettingsService;
    return {
      service: new ApiLimitsService(prisma, organizationSettings),
      count,
    };
  }

  it('returns not exceeded when limit is null (unlimited)', async () => {
    const { service, count } = makeService(null);

    const result = await service.checkApiRequestLimit('org-1');

    expect(result).toEqual({ exceeded: false, current: 0, limit: null });
    expect(count).not.toHaveBeenCalled();
  });

  it('returns not exceeded when count is below limit', async () => {
    const { service, count } = makeService(100);
    count.mockResolvedValue(42);

    const result = await service.checkApiRequestLimit('org-1');

    expect(result).toEqual({ exceeded: false, current: 42, limit: 100 });
  });

  it('returns exceeded when count meets or exceeds limit', async () => {
    const { service, count } = makeService(100);
    count.mockResolvedValue(100);

    const result = await service.checkApiRequestLimit('org-1');

    expect(result).toEqual({ exceeded: true, current: 100, limit: 100 });
  });

  it('filters by CHAT_COMPLETION step and API source metadata', async () => {
    const { service, count } = makeService(100);
    count.mockResolvedValue(10);

    await service.checkApiRequestLimit('org-1');

    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          step: 'CHAT_COMPLETION',
          metadata: { path: ['source'], equals: 'API' },
        }),
      }),
    );
  });

  describe('checkUsageCeilings', () => {
    function makeCeilingService(
      limits: Partial<{
        monthlyTokenLimit: number | null;
        monthlyCostLimitCents: number | null;
        monthlyMessageLimit: number | null;
      }> = {},
    ) {
      const count = jest.fn().mockResolvedValue(0);
      const aggregate = jest
        .fn()
        .mockResolvedValue({ _sum: { totalTokens: 0, estimatedCost: 0 } });
      const prisma = {
        client: { aiUsage: { count, aggregate } },
      } as unknown as PrismaService;
      const organizationSettings = {
        getUsageLimits: jest.fn().mockResolvedValue({
          monthlyTokenLimit: null,
          monthlyCostLimitCents: null,
          monthlyMessageLimit: null,
          monthlyApiRequestLimit: null,
          maxMembers: null,
          ...limits,
        }),
      } as unknown as OrganizationSettingsService;
      return {
        service: new ApiLimitsService(prisma, organizationSettings),
        count,
        aggregate,
      };
    }

    it('exceeds nothing when every ceiling is null', async () => {
      const { service, aggregate, count } = makeCeilingService();
      aggregate.mockResolvedValue({
        _sum: { totalTokens: 9_999_999, estimatedCost: 999 },
      });
      count.mockResolvedValue(9999);

      const result = await service.checkUsageCeilings('org-1');

      expect(result.exceeded).toEqual([]);
    });

    it('exceeds the cost ceiling at exactly the limit, in cents', async () => {
      const { service, aggregate } = makeCeilingService({
        monthlyCostLimitCents: 500,
      });
      aggregate.mockResolvedValue({
        _sum: { totalTokens: 0, estimatedCost: 5 },
      });

      const result = await service.checkUsageCeilings('org-1');

      expect(result.exceeded).toEqual(['cost']);
      expect(result.current.totalCostCents).toBe(500);
    });

    /**
     * The distinction this exists to hold, and the one apps/web's counterpart
     * holds too: spend aggregates over every step because embeddings cost
     * money, while the message ceiling counts chat turns. One ingest writes a
     * row per embedded chunk.
     */
    it('counts only chat completions toward the message ceiling', async () => {
      const { service, count } = makeCeilingService({
        monthlyMessageLimit: 10,
      });
      count.mockResolvedValue(4);

      const result = await service.checkUsageCeilings('org-1');

      expect(count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ step: 'CHAT_COMPLETION' }),
        }),
      );
      expect(result.current.totalMessages).toBe(4);
      expect(result.exceeded).toEqual([]);
    });

    it('aggregates spend over every step', async () => {
      const { service, aggregate } = makeCeilingService();

      await service.checkUsageCeilings('org-1');

      const [args] = aggregate.mock.calls[0] as [
        { where: Record<string, unknown> },
      ];
      expect(args.where.step).toBeUndefined();
    });

    it('reports every ceiling that is over, not just the first', async () => {
      const { service, aggregate, count } = makeCeilingService({
        monthlyTokenLimit: 100,
        monthlyCostLimitCents: 100,
        monthlyMessageLimit: 1,
      });
      aggregate.mockResolvedValue({
        _sum: { totalTokens: 500, estimatedCost: 10 },
      });
      count.mockResolvedValue(5);

      const result = await service.checkUsageCeilings('org-1');

      expect(result.exceeded).toEqual(['tokens', 'cost', 'messages']);
    });
  });
});
