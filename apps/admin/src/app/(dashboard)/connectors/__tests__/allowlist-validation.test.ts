import { beforeEach, describe, expect, it, vi } from 'vitest';

const admin = { id: 'admin-1', email: 'admin@example.com', name: 'Admin' };
const catalogCount = vi.fn();
const settingsUpsert = vi.fn();
const settingsFindUnique = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: () => Promise.resolve(admin),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/audit', () => ({
  ADMIN_ACTIONS: {
    defaultConnectorsChanged: 'admin.defaults.connectors_changed',
    orgConnectorsChanged: 'admin.organization.connectors_changed',
  },
  recordAdminAction: vi.fn(),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    mcpCatalogEntry: {
      count: (...a: unknown[]) => catalogCount(...a),
      findMany: vi.fn().mockResolvedValue([]),
    },
    settings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      upsert: (...a: unknown[]) => settingsUpsert(...a),
    },
    organizationSettings: { upsert: vi.fn(), findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}));

import { saveDefaultAllowedConnectorsAction } from '../actions';

describe('saving the platform allowlist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsFindUnique.mockResolvedValue(null);
  });

  it('accepts a slug the catalogue carries but no build knows', async () => {
    // This is the point of C4: before it, the validator asked a compiled-in
    // list of eleven, so a connector a platform administrator had just added
    // could not be granted to any organization — the row existed, the gallery
    // could show it, and this page refused to save it.
    catalogCount.mockResolvedValue(1);

    await expect(
      saveDefaultAllowedConnectorsAction(['notion']),
    ).resolves.toBeUndefined();
    expect(catalogCount).toHaveBeenCalledWith({
      where: { slug: { in: ['notion'] } },
    });
    expect(settingsUpsert).toHaveBeenCalled();
  });

  it('refuses a slug the catalogue does not carry', async () => {
    catalogCount.mockResolvedValue(0);

    await expect(
      saveDefaultAllowedConnectorsAction(['not-a-connector']),
    ).rejects.toThrow(/Invalid connector/);
    expect(settingsUpsert).not.toHaveBeenCalled();
  });

  it('refuses a duplicate, which names nothing extra', async () => {
    await expect(
      saveDefaultAllowedConnectorsAction(['notion', 'notion']),
    ).rejects.toThrow(/Invalid connector/);
  });

  it('accepts the empty list, which means no restriction', async () => {
    await expect(
      saveDefaultAllowedConnectorsAction([]),
    ).resolves.toBeUndefined();
    expect(catalogCount).not.toHaveBeenCalled();
  });
});
