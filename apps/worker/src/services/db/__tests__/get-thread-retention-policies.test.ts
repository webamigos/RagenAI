const mocks = vi.hoisted(() => ({
  organizationFindMany: vi.fn(),
  settingsFindMany: vi.fn(),
}));

vi.mock('../prisma.js', () => ({
  getPrisma: () => ({
    organization: { findMany: mocks.organizationFindMany },
    organizationSettings: { findMany: mocks.settingsFindMany },
  }),
}));

vi.mock('../../logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { isTenantScopeSatisfied } from '@ragenai/platform-contracts';

import { db } from '../db.js';

type SettingsArgs = {
  where: {
    organizationId: { in: string[] };
    threadRetentionDays: { not: null };
  };
};

const settingsCalls = () =>
  mocks.settingsFindMany.mock.calls.map((call) => call[0] as SettingsArgs);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.settingsFindMany.mockResolvedValue([]);
});

describe('getThreadRetentionPolicies', () => {
  it('returns the organizations that have a period set', async () => {
    mocks.organizationFindMany.mockResolvedValue([
      { id: 'org-a' },
      { id: 'org-b' },
    ]);
    mocks.settingsFindMany.mockResolvedValue([
      { organizationId: 'org-a', threadRetentionDays: 90 },
    ]);

    await expect(db.getThreadRetentionPolicies()).resolves.toEqual([
      { organizationId: 'org-a', threadRetentionDays: 90 },
    ]);
    expect(settingsCalls()[0]?.where.threadRetentionDays).toEqual({
      not: null,
    });
  });

  // `organization_settings` is tenant-scoped: a bare "every row with a
  // period" read is the cross-org query the guard reports. A non-empty `in`
  // over listed organizations is the shape it accepts.
  it('scopes every settings read to named organizations', async () => {
    mocks.organizationFindMany.mockResolvedValue([
      { id: 'org-a' },
      { id: 'org-b' },
    ]);

    await db.getThreadRetentionPolicies();

    for (const args of settingsCalls()) {
      expect(args.where.organizationId.in).toEqual(['org-a', 'org-b']);
      expect(
        isTenantScopeSatisfied(
          'OrganizationSettings',
          'findMany',
          args as unknown as Parameters<typeof isTenantScopeSatisfied>[2],
        ),
      ).toBe(true);
    }
  });

  it('reads the settings in chunks, so no IN list grows with the tenant count', async () => {
    mocks.organizationFindMany.mockResolvedValue(
      Array.from({ length: 1201 }, (_, i) => ({ id: `org-${i}` })),
    );

    await db.getThreadRetentionPolicies();

    const sizes = settingsCalls().map((a) => a.where.organizationId.in.length);
    expect(sizes).toEqual([500, 500, 201]);
  });

  it('reads no settings when there are no organizations', async () => {
    mocks.organizationFindMany.mockResolvedValue([]);

    await expect(db.getThreadRetentionPolicies()).resolves.toEqual([]);
    expect(mocks.settingsFindMany).not.toHaveBeenCalled();
  });
});
