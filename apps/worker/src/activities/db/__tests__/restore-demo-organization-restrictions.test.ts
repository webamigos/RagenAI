/* eslint-disable no-var */
var mockRestore: jest.Mock;
var mockDemoOrganizationId: string | undefined;
/* eslint-enable no-var */

jest.mock('../../../services/db', () => ({
  db: {
    restoreOrganizationRestrictions: (...args: unknown[]) =>
      mockRestore(...args),
  },
}));

jest.mock('../../../services/logger', () => ({
  logger: { info: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../consts', () => ({
  get DEMO_ORGANIZATION_ID() {
    return mockDemoOrganizationId;
  },
}));

import {
  DEMO_MONTHLY_COST_LIMIT_CENTS,
  DEMO_NIGHTLY_RESTORE,
  DEMO_ORGANIZATION_RESTRICTIONS,
} from '@ragenai/platform-contracts';

import { restoreDemoOrganizationRestrictions } from '../restore-demo-organization-restrictions';

describe('restoreDemoOrganizationRestrictions', () => {
  beforeEach(() => {
    mockRestore = jest.fn().mockResolvedValue(undefined);
    mockDemoOrganizationId = 'org-demo';
  });

  it('restores the feature flags for the configured organization', async () => {
    const result = await restoreDemoOrganizationRestrictions();

    expect(result).toEqual({ skipped: false, restored: true });
    expect(mockRestore).toHaveBeenCalledTimes(1);
    expect(mockRestore).toHaveBeenCalledWith('org-demo', DEMO_NIGHTLY_RESTORE);
  });

  it('does not carry the spend cap into the nightly write', async () => {
    // The demo deployment runs on an operator's deliberate 1000 while the
    // constant is a placeholder 5000. Restoring the cap would have raised the
    // month's budget fivefold on an account strangers use — and a visitor
    // cannot change the cap anyway, so there is nothing to restore.
    await restoreDemoOrganizationRestrictions();

    const [, written] = mockRestore.mock.calls[0] as [string, object];
    expect(Object.keys(written)).toEqual(['featureOverrides']);
    expect(DEMO_ORGANIZATION_RESTRICTIONS.monthlyCostLimitCents).toBe(
      DEMO_MONTHLY_COST_LIMIT_CENTS,
    );
  });

  it('uses the object the seed writes, not a private copy', () => {
    // The point of the move to platform-contracts: a flag added to the demo
    // restrictions reaches the nightly restore without a second edit.
    expect(DEMO_NIGHTLY_RESTORE.featureOverrides).toMatchObject({
      manageDocuments: false,
      manageOrganizationSettings: false,
      mcpConnectors: false,
    });
    expect(DEMO_NIGHTLY_RESTORE.featureOverrides).toBe(
      DEMO_ORGANIZATION_RESTRICTIONS.featureOverrides,
    );
  });

  it('does nothing when no demo organization is configured', async () => {
    mockDemoOrganizationId = undefined;

    const result = await restoreDemoOrganizationRestrictions();

    expect(result).toEqual({ skipped: true, restored: false });
    expect(mockRestore).not.toHaveBeenCalled();
  });
});
