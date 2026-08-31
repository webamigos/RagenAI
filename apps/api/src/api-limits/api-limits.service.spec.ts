import { ApiLimitsService } from './api-limits.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrganizationSettingsService } from '../organizations/organization-settings.service.js';

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
});
