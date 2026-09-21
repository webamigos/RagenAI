/**
 * The Fireflies lookup crosses two key spaces the slug migration touched: the
 * database compound key, which moved from `provider` to `providerSlug`, and
 * the vault's provider name, which did not move at all. If those two ever
 * disagree the connector stops working for everyone already connected, and
 * nothing else in the suite compares them.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    mcpConnector: { findUnique: (...a: unknown[]) => findUnique(...a) },
  },
}));

vi.mock('@/generated/prisma/client', () => ({
  McpConnectorStatus: { CONNECTED: 'CONNECTED', PENDING: 'PENDING' },
}));

const getToken = vi.fn();
vi.mock('@/libs/ragen-vault', () => ({
  ragenAuthClient: { getToken: (...a: unknown[]) => getToken(...a) },
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const { getFirefliesConnectorQuery } =
  await import('../get-fireflies-connector-query');

const connected = {
  enabled: true,
  status: 'CONNECTED',
  customerId: 'org-1:user-1:fireflies',
};

describe('getFirefliesConnectorQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue(connected);
    getToken.mockResolvedValue({ accessToken: 'ff-key' });
  });

  it('looks the connector up by providerSlug, not the dropped column', async () => {
    await getFirefliesConnectorQuery('org-1', 'user-1');

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId_userId_providerSlug: {
            organizationId: 'org-1',
            userId: 'user-1',
            providerSlug: 'FIREFLIES',
          },
        },
      }),
    );
  });

  it('asks the vault for the slug verbatim', async () => {
    // `providerKey` does not lowercase; only `customerId` does. The two
    // differ in case for a built-in on purpose.
    await getFirefliesConnectorQuery('org-1', 'user-1');

    expect(getToken).toHaveBeenCalledWith(
      'org-1:user-1:fireflies',
      'FIREFLIES',
    );
  });

  it('returns the key of a connected connector', async () => {
    await expect(
      getFirefliesConnectorQuery('org-1', 'user-1'),
    ).resolves.toEqual({ apiKey: 'ff-key' });
  });

  it('answers with nothing when the connector is disabled', async () => {
    findUnique.mockResolvedValue({ ...connected, enabled: false });

    await expect(
      getFirefliesConnectorQuery('org-1', 'user-1'),
    ).resolves.toBeNull();
  });

  it('answers with nothing when the vault refuses', async () => {
    getToken.mockRejectedValue(new Error('vault down'));

    await expect(
      getFirefliesConnectorQuery('org-1', 'user-1'),
    ).resolves.toBeNull();
  });
});
