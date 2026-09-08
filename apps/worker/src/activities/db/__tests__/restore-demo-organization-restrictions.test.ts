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

import { DEMO_ORGANIZATION_RESTRICTIONS } from '@ragenai/platform-contracts';

import { restoreDemoOrganizationRestrictions } from '../restore-demo-organization-restrictions';

describe('restoreDemoOrganizationRestrictions', () => {
  beforeEach(() => {
    mockRestore = jest.fn().mockResolvedValue(undefined);
    mockDemoOrganizationId = 'org-demo';
  });

  it('writes the shared restrictions to the configured organization', async () => {
    const result = await restoreDemoOrganizationRestrictions();

    expect(result).toEqual({ skipped: false, restored: true });
    expect(mockRestore).toHaveBeenCalledTimes(1);
    expect(mockRestore).toHaveBeenCalledWith(
      'org-demo',
      DEMO_ORGANIZATION_RESTRICTIONS,
    );
  });

  it('uses the object the seed writes, not a private copy', () => {
    // The point of the move to platform-contracts: a flag added to the demo
    // restrictions reaches the nightly restore without a second edit.
    expect(DEMO_ORGANIZATION_RESTRICTIONS.featureOverrides).toMatchObject({
      manageDocuments: false,
      manageOrganizationSettings: false,
      mcpConnectors: false,
    });
  });

  it('does nothing when no demo organization is configured', async () => {
    mockDemoOrganizationId = undefined;

    const result = await restoreDemoOrganizationRestrictions();

    expect(result).toEqual({ skipped: true, restored: false });
    expect(mockRestore).not.toHaveBeenCalled();
  });
});
