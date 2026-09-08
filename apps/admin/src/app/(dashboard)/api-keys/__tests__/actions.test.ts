import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const apiKeyFindUnique = vi.fn();
const apiKeyUpdate = vi.fn();
const apiKeyDelete = vi.fn();
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
    apiKey: {
      findUnique: (...a: unknown[]) => apiKeyFindUnique(...a),
      update: (...a: unknown[]) => apiKeyUpdate(...a),
      delete: (...a: unknown[]) => apiKeyDelete(...a),
    },
  },
}));

vi.mock('@/lib/vault', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/vault')>()),
  isVaultConfigured: () => isVaultConfigured(),
  getVaultClient: () => ({ deleteToken }),
}));

const { deactivateApiKeyAction, reactivateApiKeyAction, revokeApiKeyAction } =
  await import('../actions');

const ADMIN = { id: 'admin-1', email: 'admin@example.com', name: 'Admin' };
const KEY = {
  id: 'key-1',
  name: 'CI pipeline',
  organizationId: 'org-1',
  maskedValue: 'sk-key...9f2c',
  isActive: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(ADMIN);
  apiKeyFindUnique.mockResolvedValue(KEY);
  apiKeyUpdate.mockResolvedValue(KEY);
  apiKeyDelete.mockResolvedValue(KEY);
  deleteToken.mockResolvedValue(undefined);
  isVaultConfigured.mockReturnValue(true);
  recordAdminAction.mockResolvedValue(undefined);
});

describe('deactivateApiKeyAction', () => {
  it('clears isActive without touching the vault', async () => {
    await deactivateApiKeyAction('key-1');

    expect(apiKeyUpdate).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { isActive: false },
    });
    // The point of the reversible control: the secret survives, so
    // reactivating restores a working key.
    expect(deleteToken).not.toHaveBeenCalled();
    expect(apiKeyDelete).not.toHaveBeenCalled();
  });

  it('refuses a key that is already deactivated', async () => {
    apiKeyFindUnique.mockResolvedValue({ ...KEY, isActive: false });

    await expect(deactivateApiKeyAction('key-1')).rejects.toThrow(
      /already deactivated/,
    );
    expect(apiKeyUpdate).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it('files the entry as API_KEY_REVOKED', async () => {
    await deactivateApiKeyAction('key-1');

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.api_key.deactivated',
        entityType: 'api-key',
        entityId: 'key-1',
        organizationId: 'org-1',
        securityEvent: { eventType: 'API_KEY_REVOKED', severity: 'warn' },
      }),
    );
  });
});

describe('reactivateApiKeyAction', () => {
  beforeEach(() => {
    apiKeyFindUnique.mockResolvedValue({ ...KEY, isActive: false });
  });

  it('restores isActive', async () => {
    await reactivateApiKeyAction('key-1');

    expect(apiKeyUpdate).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { isActive: true },
    });
  });

  /**
   * Re-enabling a credential is not a revocation. The incidents view filters
   * on `eventType`, so filing it as `API_KEY_REVOKED` would put it in the
   * bucket somebody searches to find withdrawals.
   */
  it('is not filed as a revocation', async () => {
    await reactivateApiKeyAction('key-1');

    const call = recordAdminAction.mock.calls[0]![0] as {
      securityEvent: { eventType: string };
    };
    expect(call.securityEvent.eventType).toBe('ADMIN_SETTINGS_CHANGED');
  });

  it('refuses a key that is already active', async () => {
    apiKeyFindUnique.mockResolvedValue(KEY);

    await expect(reactivateApiKeyAction('key-1')).rejects.toThrow(
      /already active/,
    );
    expect(apiKeyUpdate).not.toHaveBeenCalled();
  });
});

describe('revokeApiKeyAction', () => {
  it('deactivates, then deletes the secret, then deletes the row', async () => {
    const order: string[] = [];
    apiKeyUpdate.mockImplementation(async () => {
      order.push('deactivate');
      return KEY;
    });
    deleteToken.mockImplementation(async () => {
      order.push('vault');
    });
    apiKeyDelete.mockImplementation(async () => {
      order.push('row');
      return KEY;
    });

    const result = await revokeApiKeyAction('key-1');

    expect(result).toEqual({ ok: true });
    // The order is the whole design. The row is the only thing that names the
    // vault entry, so deleting it before the secret loses the handle — which
    // is what apps/web's fire-and-forget delete does.
    expect(order).toEqual(['deactivate', 'vault', 'row']);
    expect(deleteToken).toHaveBeenCalledWith('api-key-key-1', 'ragen-api-key');
  });

  it('does not write isActive again when the key is already inactive', async () => {
    apiKeyFindUnique.mockResolvedValue({ ...KEY, isActive: false });

    await revokeApiKeyAction('key-1');

    expect(apiKeyUpdate).not.toHaveBeenCalled();
    expect(apiKeyDelete).toHaveBeenCalled();
  });

  /**
   * The failure that matters. A vault error must leave a key that is dead at
   * the guard and still has a row, so the administrator can retry — not a
   * deleted row and an unreachable secret.
   */
  it('keeps the row and reports the orphan when the vault delete fails', async () => {
    deleteToken.mockRejectedValue(new Error('vault unreachable'));

    const result = await revokeApiKeyAction('key-1');

    expect(result).toEqual({
      ok: false,
      deactivated: true,
      reason: expect.stringContaining('vault unreachable'),
    });
    expect(apiKeyUpdate).toHaveBeenCalledWith({
      where: { id: 'key-1' },
      data: { isActive: false },
    });
    expect(apiKeyDelete).not.toHaveBeenCalled();
  });

  it('records the partial revocation rather than staying silent', async () => {
    deleteToken.mockRejectedValue(new Error('vault unreachable'));

    await revokeApiKeyAction('key-1');

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.api_key.revoked',
        after: expect.objectContaining({
          vaultSecretDeleted: false,
          rowDeleted: false,
        }),
      }),
    );
  });

  it('changes nothing when the vault is not configured', async () => {
    isVaultConfigured.mockReturnValue(false);

    const result = await revokeApiKeyAction('key-1');

    expect(result.ok).toBe(false);
    expect(apiKeyUpdate).not.toHaveBeenCalled();
    expect(apiKeyDelete).not.toHaveBeenCalled();
    expect(deleteToken).not.toHaveBeenCalled();
    expect(recordAdminAction).not.toHaveBeenCalled();
  });

  it('passes a security event so an orphaned key can still be recorded', async () => {
    // `ApiKey.organization` is onDelete: SetNull, so `organizationId` can be
    // null — and `AuditLog.organizationId` is a required FK, so without a
    // security event `recordAdminAction` would refuse the entry outright.
    apiKeyFindUnique.mockResolvedValue({ ...KEY, organizationId: null });

    await revokeApiKeyAction('key-1');

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: null,
        securityEvent: { eventType: 'API_KEY_REVOKED', severity: 'warn' },
      }),
    );
  });

  it('rejects an unknown key before writing anything', async () => {
    apiKeyFindUnique.mockResolvedValue(null);

    await expect(revokeApiKeyAction('nope')).rejects.toThrow(/not found/);
    expect(apiKeyUpdate).not.toHaveBeenCalled();
    expect(deleteToken).not.toHaveBeenCalled();
  });
});
