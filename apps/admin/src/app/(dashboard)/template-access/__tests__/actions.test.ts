import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const templateFindMany = vi.fn();
const settingsFindUnique = vi.fn();
const settingsUpsert = vi.fn();
const orgFindUnique = vi.fn();
const orgSettingsUpsert = vi.fn();

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
    assistantTemplate: {
      findMany: (...a: unknown[]) => templateFindMany(...a),
    },
    settings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      upsert: (...a: unknown[]) => settingsUpsert(...a),
    },
    organization: { findUnique: (...a: unknown[]) => orgFindUnique(...a) },
    organizationSettings: {
      upsert: (...a: unknown[]) => orgSettingsUpsert(...a),
    },
  },
}));

const {
  getActiveTemplatesAction,
  getDefaultAllowedTemplatesAction,
  saveDefaultAllowedTemplatesAction,
  saveOrgAllowedTemplatesAction,
} = await import('../actions');

const ORG_ID = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
  orgFindUnique.mockResolvedValue({ id: ORG_ID });
  templateFindMany.mockResolvedValue([]);
});

describe('getActiveTemplatesAction', () => {
  // An archived template must not appear as something to grant access to.
  it('lists only active templates, in sort order', async () => {
    await getActiveTemplatesAction();

    expect(templateFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
        orderBy: { sortOrder: 'asc' },
      }),
    );
  });
});

describe('getDefaultAllowedTemplatesAction', () => {
  it('returns an empty list when unset', async () => {
    settingsFindUnique.mockResolvedValue(null);
    await expect(getDefaultAllowedTemplatesAction()).resolves.toEqual([]);
  });

  it('parses the stored array', async () => {
    settingsFindUnique.mockResolvedValue({ value: '["t1","t2"]' });
    await expect(getDefaultAllowedTemplatesAction()).resolves.toEqual([
      't1',
      't2',
    ]);
  });

  it('falls back to an empty list on malformed JSON', async () => {
    settingsFindUnique.mockResolvedValue({ value: 'oops' });
    await expect(getDefaultAllowedTemplatesAction()).resolves.toEqual([]);
  });

  it('drops non-string entries from a hand-edited row', async () => {
    settingsFindUnique.mockResolvedValue({ value: '["t1",5,null,"t2"]' });
    await expect(getDefaultAllowedTemplatesAction()).resolves.toEqual([
      't1',
      't2',
    ]);
  });
});

describe('saveDefaultAllowedTemplatesAction', () => {
  it('stores the selection under default_allowed_templates', async () => {
    await saveDefaultAllowedTemplatesAction(['t1']);

    expect(settingsUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'default_allowed_templates' },
        update: { value: '["t1"]' },
      }),
    );
  });
});

describe('saveOrgAllowedTemplatesAction', () => {
  it('upserts the organization allowlist', async () => {
    await saveOrgAllowedTemplatesAction(ORG_ID, ['t1', 't2']);

    expect(orgSettingsUpsert).toHaveBeenCalledWith({
      where: { organizationId: ORG_ID },
      update: { allowedTemplates: ['t1', 't2'] },
      create: { organizationId: ORG_ID, allowedTemplates: ['t1', 't2'] },
    });
  });

  it('rejects a blank organization ID', async () => {
    await expect(saveOrgAllowedTemplatesAction('  ', ['t1'])).rejects.toThrow(
      /Invalid organization/,
    );
  });

  it('rejects an organization that does not exist', async () => {
    orgFindUnique.mockResolvedValue(null);

    await expect(saveOrgAllowedTemplatesAction(ORG_ID, ['t1'])).rejects.toThrow(
      /Organization not found/,
    );
    expect(orgSettingsUpsert).not.toHaveBeenCalled();
  });
});

describe('the platform-admin guard', () => {
  it.each([
    ['getActiveTemplatesAction', () => getActiveTemplatesAction()],
    [
      'getDefaultAllowedTemplatesAction',
      () => getDefaultAllowedTemplatesAction(),
    ],
    [
      'saveDefaultAllowedTemplatesAction',
      () => saveDefaultAllowedTemplatesAction(['t1']),
    ],
    [
      'saveOrgAllowedTemplatesAction',
      () => saveOrgAllowedTemplatesAction(ORG_ID, ['t1']),
    ],
  ])(
    '%s refuses a caller that is not a platform administrator',
    async (_name, call) => {
      requireAdmin.mockRejectedValue(new Error('Forbidden'));

      await expect(call()).rejects.toThrow(/Forbidden/);
      expect(settingsUpsert).not.toHaveBeenCalled();
      expect(orgSettingsUpsert).not.toHaveBeenCalled();
      expect(templateFindMany).not.toHaveBeenCalled();
    },
  );
});
