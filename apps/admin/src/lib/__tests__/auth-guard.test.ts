import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSession = vi.fn();
const findUnique = vi.fn();

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('../auth', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
}));

vi.mock('../db', () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

const { getAdminUser, requireAdmin, APP_ADMIN_ROLE } =
  await import('../auth-guard');

const SESSION = { user: { id: 'u1' } };
const ADMIN_ROW = {
  id: 'u1',
  email: 'admin@example.com',
  name: 'Admin',
  role: APP_ADMIN_ROLE,
  banned: false,
};

describe('getAdminUser', () => {
  beforeEach(() => {
    getSession.mockReset();
    findUnique.mockReset();
  });

  it('returns the user when the account has the platform-admin role', async () => {
    getSession.mockResolvedValue(SESSION);
    findUnique.mockResolvedValue(ADMIN_ROW);

    await expect(getAdminUser()).resolves.toEqual({
      id: 'u1',
      email: 'admin@example.com',
      name: 'Admin',
    });
  });

  it('returns null when there is no session', async () => {
    getSession.mockResolvedValue(null);

    await expect(getAdminUser()).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  // The regression this guard exists for: `users` is shared with apps/web, so
  // an ordinary customer can hold a perfectly valid session here.
  it('returns null for a signed-in account whose role is not admin', async () => {
    getSession.mockResolvedValue(SESSION);
    findUnique.mockResolvedValue({ ...ADMIN_ROW, role: 'user' });

    await expect(getAdminUser()).resolves.toBeNull();
  });

  it('returns null for a banned administrator', async () => {
    getSession.mockResolvedValue(SESSION);
    findUnique.mockResolvedValue({ ...ADMIN_ROW, banned: true });

    await expect(getAdminUser()).resolves.toBeNull();
  });

  it('returns null when the session points at a deleted user', async () => {
    getSession.mockResolvedValue(SESSION);
    findUnique.mockResolvedValue(null);

    await expect(getAdminUser()).resolves.toBeNull();
  });

  // Reading the role from the database rather than the session is what makes
  // revocation take effect before the 5-minute session cookie cache expires.
  it('reads the role from the database, not from the session', async () => {
    getSession.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
    findUnique.mockResolvedValue({ ...ADMIN_ROW, role: 'user' });

    await expect(getAdminUser()).resolves.toBeNull();
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
  });
});

describe('requireAdmin', () => {
  beforeEach(() => {
    getSession.mockReset();
    findUnique.mockReset();
  });

  it('returns the user for a platform administrator', async () => {
    getSession.mockResolvedValue(SESSION);
    findUnique.mockResolvedValue(ADMIN_ROW);

    await expect(requireAdmin()).resolves.toMatchObject({ id: 'u1' });
  });

  it('throws for a non-admin, so a Server Action cannot proceed', async () => {
    getSession.mockResolvedValue(SESSION);
    findUnique.mockResolvedValue({ ...ADMIN_ROW, role: 'user' });

    await expect(requireAdmin()).rejects.toThrow(/Forbidden/);
  });

  it('throws when unauthenticated', async () => {
    getSession.mockResolvedValue(null);

    await expect(requireAdmin()).rejects.toThrow(/Forbidden/);
  });
});
