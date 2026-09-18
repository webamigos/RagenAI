import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const guardrailFindMany = vi.fn();
const guardrailFindFirst = vi.fn();
const overrideFindMany = vi.fn();
const overrideFindFirst = vi.fn();
const overrideCreate = vi.fn();
const overrideUpdate = vi.fn();
const overrideDelete = vi.fn();
const isOnPremise = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

const recordAdminAction = vi.fn();
vi.mock('@/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit')>()),
  recordAdminAction: (...args: unknown[]) => recordAdminAction(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@ragenai/env', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ragenai/env')>()),
  isOnPremise: () => isOnPremise(),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    guardrail: {
      findMany: (...a: unknown[]) => guardrailFindMany(...a),
      findFirst: (...a: unknown[]) => guardrailFindFirst(...a),
    },
    guardrailOrgOverride: {
      findMany: (...a: unknown[]) => overrideFindMany(...a),
      findFirst: (...a: unknown[]) => overrideFindFirst(...a),
      create: (...a: unknown[]) => overrideCreate(...a),
      update: (...a: unknown[]) => overrideUpdate(...a),
      delete: (...a: unknown[]) => overrideDelete(...a),
    },
  },
}));

const { getOrgGuardrailsAction, setGuardrailOverrideAction } =
  await import('../org-actions');

const ORG = 'org-a';
const ADMIN = { id: 'admin-1', email: 'a@example.com' };

const MODERATION = {
  id: 1,
  publicId: 'gr-moderation',
  organizationId: null,
  key: 'content-moderation',
  name: 'Content moderation',
  description: null,
  kind: 'BUILT_IN',
  stage: 'INPUT',
  action: 'BLOCK',
  enabled: true,
  severity: 'warn',
  pattern: null,
  patternIsRegex: false,
  threshold: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(ADMIN);
  isOnPremise.mockReturnValue(false);
  guardrailFindMany.mockImplementation(({ where }: { where: unknown }) =>
    Promise.resolve(
      (where as { organizationId: string | null }).organizationId === null
        ? [MODERATION]
        : [],
    ),
  );
  overrideFindMany.mockResolvedValue([]);
});

describe('the seeded override, which is stored and ignored in SaaS', () => {
  const seeded = [
    {
      id: 10,
      enabled: false,
      action: null,
      threshold: null,
      origin: 'legacy_on_premise',
      guardrail: { publicId: MODERATION.publicId },
    },
  ];

  it('does not apply off-premise, so the rule reads as still enforced', async () => {
    // The whole reason the marking exists. The column it was copied from is
    // read only on-premise, so a SaaS organization sitting on `false` is
    // moderated today and must stay moderated.
    overrideFindMany.mockResolvedValue(seeded);
    isOnPremise.mockReturnValue(false);

    const view = await getOrgGuardrailsAction(ORG);

    expect(view.rules[0].enabled).toBe(true);
    expect(view.rules[0].sources.enabled).toBe('platform-rule');
  });

  it('is still reported, so the page can show a row that does nothing', async () => {
    // Hiding it would be accurate about the effect and wrong about the state:
    // an operator who later sets IS_ON_PREMISE would meet changes nobody
    // ordered. Showing it as an ordinary override would say "off" while the
    // installation moderates. Both facts, or the screen disagrees with the
    // system.
    overrideFindMany.mockResolvedValue(seeded);
    isOnPremise.mockReturnValue(false);

    const view = await getOrgGuardrailsAction(ORG);

    expect(view.isOnPremiseInstallation).toBe(false);
    expect(view.rules[0].override).toEqual({
      enabled: false,
      action: null,
      isLegacyOnPremise: true,
    });
  });

  it('applies on-premise, where the column was read', async () => {
    overrideFindMany.mockResolvedValue(seeded);
    isOnPremise.mockReturnValue(true);

    const view = await getOrgGuardrailsAction(ORG);

    expect(view.rules[0].enabled).toBe(false);
    expect(view.rules[0].sources.enabled).toBe('org-override');
  });
});

describe('an administrator’s own override', () => {
  it('applies whatever the installation is', async () => {
    overrideFindMany.mockResolvedValue([
      {
        id: 11,
        enabled: false,
        action: null,
        threshold: null,
        origin: null,
        guardrail: { publicId: MODERATION.publicId },
      },
    ]);
    isOnPremise.mockReturnValue(false);

    const view = await getOrgGuardrailsAction(ORG);

    expect(view.rules[0].enabled).toBe(false);
    expect(view.rules[0].sources.enabled).toBe('org-override');
  });

  it('is written without an origin, so nothing gates it later', async () => {
    guardrailFindFirst.mockResolvedValue({ id: 1, publicId: 'gr-1' });
    overrideFindFirst.mockResolvedValue(null);

    await setGuardrailOverrideAction(ORG, 'gr-1', { enabled: false });

    expect(overrideCreate).toHaveBeenCalledWith({
      data: { guardrailId: 1, organizationId: ORG, enabled: false },
    });
    const written = overrideCreate.mock.calls[0][0].data;
    expect(written.origin).toBeUndefined();
  });

  it('clears the marking when it edits a seeded row', async () => {
    // From that point it is the administrator's decision, so it should apply
    // the way every other override does rather than stay suspended on a
    // deployment flag nobody remembers.
    guardrailFindFirst.mockResolvedValue({ id: 1, publicId: 'gr-1' });
    overrideFindFirst.mockResolvedValue({
      id: 10,
      enabled: false,
      origin: 'legacy_on_premise',
    });

    await setGuardrailOverrideAction(ORG, 'gr-1', { enabled: true });

    expect(overrideUpdate).toHaveBeenCalledWith({
      where: { id: 10 },
      data: { enabled: true, origin: null },
    });
  });
});

describe('inherit', () => {
  it('removes the row rather than storing one that decides nothing', async () => {
    guardrailFindFirst.mockResolvedValue({ id: 1, publicId: 'gr-1' });
    overrideFindFirst.mockResolvedValue({ id: 10, enabled: false });

    await setGuardrailOverrideAction(ORG, 'gr-1', { enabled: null });

    expect(overrideDelete).toHaveBeenCalledWith({ where: { id: 10 } });
    expect(overrideUpdate).not.toHaveBeenCalled();
  });

  it('does nothing when there was no override to begin with', async () => {
    guardrailFindFirst.mockResolvedValue({ id: 1, publicId: 'gr-1' });
    overrideFindFirst.mockResolvedValue(null);

    const result = await setGuardrailOverrideAction(ORG, 'gr-1', {
      enabled: null,
    });

    expect(result).toEqual({ ok: true });
    expect(overrideDelete).not.toHaveBeenCalled();
    expect(overrideCreate).not.toHaveBeenCalled();
  });
});

describe('what cannot be overridden', () => {
  it('refuses a target that is not a platform rule', async () => {
    // An override pointing at one organization's private rule would splice it
    // into another's set. The resolver drops such a row if it exists; this is
    // the half that stops it being written.
    guardrailFindFirst.mockResolvedValue(null);

    const result = await setGuardrailOverrideAction(ORG, 'not-platform', {
      enabled: true,
    });

    expect(result.ok).toBe(false);
    expect(overrideCreate).not.toHaveBeenCalled();
    expect(overrideUpdate).not.toHaveBeenCalled();
  });

  it('looks the rule up as a platform rule, not by id alone', async () => {
    guardrailFindFirst.mockResolvedValue(null);

    await setGuardrailOverrideAction(ORG, 'gr-1', { enabled: true });

    expect(guardrailFindFirst).toHaveBeenCalledWith({
      where: { publicId: 'gr-1', organizationId: null },
    });
  });
});

describe('the audit trail', () => {
  it('records the change against the organization it belongs to', async () => {
    guardrailFindFirst.mockResolvedValue({ id: 1, publicId: 'gr-1' });
    overrideFindFirst.mockResolvedValue({ id: 10, enabled: true });

    await setGuardrailOverrideAction(ORG, 'gr-1', { enabled: false });

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.guardrail.override_changed',
        organizationId: ORG,
        before: { enabled: true },
        after: { enabled: false },
      }),
    );
  });
});

describe('the guard', () => {
  it('requires an administrator to read the view', async () => {
    await getOrgGuardrailsAction(ORG);
    expect(requireAdmin).toHaveBeenCalled();
  });

  it('requires an administrator to write an override', async () => {
    guardrailFindFirst.mockResolvedValue(null);
    await setGuardrailOverrideAction(ORG, 'gr-1', { enabled: true });
    expect(requireAdmin).toHaveBeenCalled();
  });
});
