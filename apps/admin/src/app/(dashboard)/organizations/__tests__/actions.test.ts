import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const orgFindUnique = vi.fn();
const orgUpdate = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

// The helper has its own tests in src/lib/__tests__/audit.test.ts; here we only
// care that the action calls it, and with what.
const recordAdminAction = vi.fn();
vi.mock('@/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit')>()),
  recordAdminAction: (...args: unknown[]) => recordAdminAction(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: {
    organization: {
      findUnique: (...a: unknown[]) => orgFindUnique(...a),
      update: (...a: unknown[]) => orgUpdate(...a),
    },
  },
}));

const { renameOrgAction, changeOrgSlugAction } = await import('../actions');

const ORG_ID = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
  orgFindUnique.mockResolvedValue(null);
});

describe('renameOrgAction', () => {
  it('trims the new name', async () => {
    await renameOrgAction(ORG_ID, '  Acme  ');

    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { name: 'Acme' },
    });
  });

  it('rejects a blank name', async () => {
    await expect(renameOrgAction(ORG_ID, '   ')).rejects.toThrow(
      /Name cannot be empty/,
    );
    expect(orgUpdate).not.toHaveBeenCalled();
  });
});

describe('changeOrgSlugAction', () => {
  // The slug appears in URLs; a mixed-case duplicate would be a different row
  // but the same address.
  it('lower-cases and trims the slug', async () => {
    await changeOrgSlugAction(ORG_ID, '  ACME-Corp  ');

    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { slug: 'acme-corp' },
    });
  });

  it('checks uniqueness against the normalised slug, not the raw input', async () => {
    await changeOrgSlugAction(ORG_ID, ' ACME ');

    expect(orgFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { slug: 'acme' } }),
    );
  });

  it('rejects a slug already held by another organization', async () => {
    orgFindUnique.mockResolvedValue({ id: 'other-org' });

    await expect(changeOrgSlugAction(ORG_ID, 'taken')).rejects.toThrow(
      /already taken/,
    );
    expect(orgUpdate).not.toHaveBeenCalled();
  });

  // Re-saving the form without changing the slug must not fail on itself.
  it('allows an organization to keep its own slug', async () => {
    orgFindUnique.mockResolvedValue({ id: ORG_ID });

    await expect(changeOrgSlugAction(ORG_ID, 'mine')).resolves.toBeUndefined();
    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { slug: 'mine' },
    });
  });

  it('clears the slug to null when the field is emptied', async () => {
    await changeOrgSlugAction(ORG_ID, '   ');

    expect(orgUpdate).toHaveBeenCalledWith({
      where: { id: ORG_ID },
      data: { slug: null },
    });
  });

  // The action also snapshots the old slug by id for the audit entry, so this
  // asserts the absence of the *uniqueness* lookup specifically — the one keyed
  // by slug, which has nothing to check when the slug is being cleared.
  it('skips the uniqueness lookup when clearing the slug', async () => {
    await changeOrgSlugAction(ORG_ID, '');

    const uniquenessLookups = orgFindUnique.mock.calls.filter(
      ([args]) => args?.where && 'slug' in args.where,
    );
    expect(uniquenessLookups).toEqual([]);
  });
});

describe('the platform-admin guard', () => {
  it.each([
    ['renameOrgAction', () => renameOrgAction(ORG_ID, 'X')],
    ['changeOrgSlugAction', () => changeOrgSlugAction(ORG_ID, 'x')],
  ])(
    '%s refuses a caller that is not a platform administrator',
    async (_name, call) => {
      requireAdmin.mockRejectedValue(new Error('Forbidden'));

      await expect(call()).rejects.toThrow(/Forbidden/);
      expect(orgUpdate).not.toHaveBeenCalled();
    },
  );
});
