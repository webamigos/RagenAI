/* eslint-disable no-var */
var mockUpsert: jest.Mock;
/* eslint-enable no-var */

jest.mock('../prisma', () => {
  mockUpsert = jest.fn();
  return {
    getPrisma: () => ({
      organizationSettings: { upsert: mockUpsert },
    }),
  };
});

jest.mock('../../logger', () => ({
  logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() },
}));

import { db } from '../db';

const restrictions = {
  featureOverrides: { manageDocuments: false, mcpConnectors: false },
  monthlyCostLimitCents: 5_000,
};

beforeEach(() => {
  mockUpsert.mockReset();
  mockUpsert.mockResolvedValue({});
});

describe('restoreOrganizationRestrictions', () => {
  it('upserts by organization so a missing settings row is created', async () => {
    await db.restoreOrganizationRestrictions('org-demo', restrictions);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const args = mockUpsert.mock.calls[0][0];
    expect(args.where).toEqual({ organizationId: 'org-demo' });
    expect(args.create).toEqual({ organizationId: 'org-demo', ...args.update });
  });

  it('stores featureOverrides as a value, not a JSON string', async () => {
    // A Json column given `JSON.stringify(...)` stores a string, which
    // sanitizeFeatureOverrides reads as "no keys" — the demo left writable.
    await db.restoreOrganizationRestrictions('org-demo', restrictions);

    const { update } = mockUpsert.mock.calls[0][0];
    expect(update.featureOverrides).toEqual(restrictions.featureOverrides);
    expect(typeof update.featureOverrides).toBe('object');
    expect(update.monthlyCostLimitCents).toBe(5_000);
  });

  it('touches only the two restriction columns', async () => {
    // allowedModels is the operator's choice and must survive the night.
    await db.restoreOrganizationRestrictions('org-demo', restrictions);

    const { update } = mockUpsert.mock.calls[0][0];
    expect(Object.keys(update).sort()).toEqual([
      'featureOverrides',
      'monthlyCostLimitCents',
    ]);
  });
});
