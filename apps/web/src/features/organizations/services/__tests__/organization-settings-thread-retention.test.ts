import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  assertCanManageOrganizationSettings: vi.fn(),
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    organizationSettings: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
    },
  },
}));

vi.mock('@/app/lib/utils/hashApiKey', () => ({
  encryptApiKey: (v: string) => v,
  decryptApiKey: (v: string) => v,
}));

vi.mock('@/features/organizations/services/queries/get-api-keys-query', () => ({
  getApiKeyFromPool: () => null,
}));

vi.mock('@/features/subscriptions/services/feature-guards', () => ({
  assertCanManageOrganizationSettings:
    mocks.assertCanManageOrganizationSettings,
}));

import {
  getThreadRetentionDays,
  saveThreadRetentionDays,
} from '../organization-settings';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.upsert.mockResolvedValue({});
});

describe('getThreadRetentionDays', () => {
  it('is off for an organization with no settings row', async () => {
    mocks.findUnique.mockResolvedValue(null);

    await expect(getThreadRetentionDays('org-1')).resolves.toBeNull();
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
    });
  });

  it('returns a stored preset', async () => {
    mocks.findUnique.mockResolvedValue({ threadRetentionDays: 180 });

    await expect(getThreadRetentionDays('org-1')).resolves.toBe(180);
  });

  // The worker skips a value it does not recognise, so the panel must not
  // show it as a period that is being enforced.
  it('reads a value that is not a preset as off', async () => {
    mocks.findUnique.mockResolvedValue({ threadRetentionDays: 3 });

    await expect(getThreadRetentionDays('org-1')).resolves.toBeNull();
  });
});

describe('saveThreadRetentionDays', () => {
  it('writes the period to the organization’s own row, through the settings gate', async () => {
    await saveThreadRetentionDays('org-1', 30);

    expect(mocks.assertCanManageOrganizationSettings).toHaveBeenCalledWith(
      'org-1',
    );
    expect(mocks.upsert).toHaveBeenCalledWith({
      where: { organizationId: 'org-1' },
      update: { threadRetentionDays: 30 },
      create: { organizationId: 'org-1', threadRetentionDays: 30 },
    });
  });

  it('writes null to turn retention off', async () => {
    await saveThreadRetentionDays('org-1', null);

    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { threadRetentionDays: null } }),
    );
  });
});
