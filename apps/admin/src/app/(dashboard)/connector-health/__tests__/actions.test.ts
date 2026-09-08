import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const connectorFindUnique = vi.fn();
const connectorDelete = vi.fn();
const deleteToken = vi.fn();
const isVaultConfigured = vi.fn();

// Complete, not partial: `importOriginal` executes the real `auth-guard`,
// which imports `./auth` and builds the whole Better Auth instance inside
// whichever test imports first — ~540ms idle, and enough under `npm run
// verify`'s parallel load to blow the 5s test timeout. Only `requireAdmin` is
// used here, so the module never needs to load.
vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const recordAdminAction = vi.fn();
vi.mock('@/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit')>()),
  recordAdminAction: (...args: unknown[]) => recordAdminAction(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    mcpConnector: {
      findUnique: (...a: unknown[]) => connectorFindUnique(...a),
      delete: (...a: unknown[]) => connectorDelete(...a),
    },
  },
}));

vi.mock('@/lib/vault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/vault')>()),
  isVaultConfigured: () => isVaultConfigured(),
  getVaultClient: () => ({ deleteToken }),
}));

const { forceDisconnectConnectorAction } = await import('../actions');

const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Admin' };
const CONNECTOR = {
  id: 'conn-1',
  provider: 'SLACK',
  customerId: 'org-1:user-1:slack',
  organizationId: 'org-1',
  userId: 'user-1',
  status: 'ERROR',
  lastError: 'HTTP 401 Unauthorized',
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(ADMIN);
  connectorFindUnique.mockResolvedValue(CONNECTOR);
  connectorDelete.mockResolvedValue(CONNECTOR);
  deleteToken.mockResolvedValue(undefined);
  isVaultConfigured.mockReturnValue(true);
  recordAdminAction.mockResolvedValue(undefined);
});

describe('forceDisconnectConnectorAction', () => {
  it('deletes the credential before the row', async () => {
    const order: string[] = [];
    deleteToken.mockImplementation(async () => {
      order.push('vault');
    });
    connectorDelete.mockImplementation(async () => {
      order.push('row');
      return CONNECTOR;
    });

    const result = await forceDisconnectConnectorAction('conn-1');

    expect(result).toEqual({ ok: true, tokenWasAlreadyGone: false });
    expect(order).toEqual(['vault', 'row']);
    expect(deleteToken).toHaveBeenCalledWith('org-1:user-1:slack', 'SLACK');
  });

  /**
   * Stricter than apps/api's own disconnect, which swallows the vault error
   * and deletes the row anyway. An administrator forcing a disconnect is
   * usually doing it because the credential is suspect, so leaving a live
   * OAuth token behind while reporting success is the wrong trade here.
   */
  it('leaves the connector alone when the credential cannot be deleted', async () => {
    deleteToken.mockRejectedValue(new Error('vault unreachable'));

    const result = await forceDisconnectConnectorAction('conn-1');

    expect(result).toEqual({
      ok: false,
      reason: expect.stringContaining('vault unreachable'),
    });
    expect(connectorDelete).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  /**
   * A 404 is not a failure. Without this, a connector whose token had already
   * been deleted would be the one state that could never be cleared — and it
   * is a likely state, since that is what a user's own disconnect leaves
   * behind if its swallowed vault call succeeded but its row delete did not.
   */
  it('treats an already-deleted credential as success', async () => {
    deleteToken.mockRejectedValue(
      new Error('ragen-token-vault DELETE /v1/tokens/x returned 404: missing'),
    );

    const result = await forceDisconnectConnectorAction('conn-1');

    expect(result).toEqual({ ok: true, tokenWasAlreadyGone: true });
    expect(connectorDelete).toHaveBeenCalledWith({ where: { id: 'conn-1' } });
  });

  it('records what it destroyed, including the fault it was clearing', async () => {
    await forceDisconnectConnectorAction('conn-1');

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.connector.force_disconnected',
        entityType: 'connector',
        entityId: 'conn-1',
        organizationId: 'org-1',
        before: expect.objectContaining({
          provider: 'SLACK',
          status: 'ERROR',
          lastError: 'HTTP 401 Unauthorized',
        }),
        securityEvent: { eventType: 'ADMIN_USER_ACTION', severity: 'warn' },
      }),
    );
  });

  it('refuses without a configured vault rather than deleting the row', async () => {
    isVaultConfigured.mockReturnValue(false);

    const result = await forceDisconnectConnectorAction('conn-1');

    expect(result.ok).toBe(false);
    expect(deleteToken).not.toHaveBeenCalled();
    expect(connectorDelete).not.toHaveBeenCalled();
  });

  it('reports an unknown connector instead of throwing', async () => {
    connectorFindUnique.mockResolvedValue(null);

    const result = await forceDisconnectConnectorAction('nope');

    expect(result).toEqual({ ok: false, reason: 'Connector not found' });
    expect(deleteToken).not.toHaveBeenCalled();
  });
});
