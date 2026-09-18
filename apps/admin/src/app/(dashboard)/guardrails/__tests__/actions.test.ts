import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const findMany = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();
const del = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

const recordAdminAction = vi.fn();
vi.mock('@/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit')>()),
  recordAdminAction: (...args: unknown[]) => recordAdminAction(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: {
    guardrail: {
      findMany: (...a: unknown[]) => findMany(...a),
      findFirst: (...a: unknown[]) => findFirst(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
      delete: (...a: unknown[]) => del(...a),
    },
  },
}));

const {
  createGuardrailAction,
  deleteGuardrailAction,
  listPlatformGuardrailsAction,
  toggleGuardrailAction,
  updateGuardrailAction,
} = await import('../actions');

const ADMIN = { id: 'admin-1', email: 'a@example.com' };
const ID = 'gr-1';

/** A rule the form would produce: the one combination this build evaluates. */
const VALID = {
  name: 'Card numbers',
  kind: 'PATTERN' as const,
  stage: 'INPUT' as const,
  action: 'LOG' as const,
  severity: 'warn' as const,
  pattern: '\\d{4}-\\d{4}',
  patternIsRegex: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(ADMIN);
  create.mockResolvedValue({
    id: 1,
    publicId: ID,
    name: VALID.name,
    kind: 'PATTERN',
    stage: 'INPUT',
    action: 'LOG',
  });
  update.mockResolvedValue({
    id: 1,
    publicId: ID,
    name: VALID.name,
    stage: 'INPUT',
    action: 'LOG',
    pattern: VALID.pattern,
  });
});

describe('listing', () => {
  it('asks only for platform rules', async () => {
    // Without `organizationId: null` this page would show every
    // organization's private rules to a platform administrator who has no
    // business seeing them. The tenant-scope guard warns rather than blocks
    // on these models, so the `where` has to be right here.
    findMany.mockResolvedValue([]);

    await listPlatformGuardrailsAction();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: null } }),
    );
  });

  it('requires an administrator', async () => {
    findMany.mockResolvedValue([]);
    await listPlatformGuardrailsAction();
    expect(requireAdmin).toHaveBeenCalled();
  });
});

describe('creating', () => {
  it('writes the rule switched off, whatever was asked for', async () => {
    // Observation mode is the creation default, and it is not negotiable from
    // the form: a rule that starts by blocking is a rule whose false-positive
    // rate nobody has measured.
    const result = await createGuardrailAction(VALID);

    expect(result).toEqual({ ok: true });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ enabled: false, organizationId: null }),
      }),
    );
  });

  it('records what was done, and by whom', async () => {
    await createGuardrailAction(VALID);

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: ADMIN,
        action: 'admin.guardrail.created',
        entityType: 'guardrail',
        entityId: ID,
      }),
    );
  });

  it('refuses a combination this build cannot evaluate', async () => {
    // The check exists on the server as well as in the form, because a Server
    // Action is a public endpoint and the form may be a stale tab.
    const result = await createGuardrailAction({
      ...VALID,
      kind: 'LLM_POLICY',
      pattern: undefined,
    });

    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses an action the kind cannot carry out', async () => {
    const result = await createGuardrailAction({ ...VALID, action: 'MASK' });

    // MASK is valid for PATTERN, so this one is allowed — the guard is about
    // the kinds that return no span.
    expect(result).toEqual({ ok: true });
  });

  it('refuses a pattern that backtracks catastrophically', async () => {
    // The save gate, end to end: the pattern runs against adversarial
    // fixtures in a worker that is killed on the deadline, because nothing can
    // interrupt it once a request has entered it.
    const result = await createGuardrailAction({
      ...VALID,
      pattern: '(a+)+$',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('backtracks');
    }
    expect(create).not.toHaveBeenCalled();
  }, 20_000);

  it('refuses a rule with no name', async () => {
    const result = await createGuardrailAction({ ...VALID, name: '   ' });

    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('editing', () => {
  it('will not change a built-in detector’s kind', async () => {
    // `key` is what the resolver matches a detector on. A renamed or retyped
    // built-in is a detector that silently no longer exists, and the unique
    // index cannot catch it — that guards the opposite failure.
    findFirst.mockResolvedValue({
      id: 1,
      publicId: ID,
      key: 'content-moderation',
      kind: 'BUILT_IN',
      name: 'Content moderation',
      stage: 'INPUT',
      action: 'BLOCK',
      pattern: null,
      enabled: false,
    });

    const result = await updateGuardrailAction(ID, VALID);

    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it('scopes its lookup to platform rules', async () => {
    findFirst.mockResolvedValue(null);

    await updateGuardrailAction(ID, VALID);

    expect(findFirst).toHaveBeenCalledWith({
      where: { publicId: ID, organizationId: null },
    });
  });

  it('records the before and the after', async () => {
    findFirst.mockResolvedValue({
      id: 1,
      publicId: ID,
      key: null,
      kind: 'PATTERN',
      name: 'Old name',
      stage: 'INPUT',
      action: 'LOG',
      pattern: 'old',
      enabled: false,
    });

    await updateGuardrailAction(ID, VALID);

    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.guardrail.updated',
        before: expect.objectContaining({ name: 'Old name' }),
        after: expect.objectContaining({ name: VALID.name }),
      }),
    );
  });
});

describe('switching a rule on and off', () => {
  it('records both sides of the change', async () => {
    findFirst.mockResolvedValue({ id: 1, publicId: ID, enabled: false });

    const result = await toggleGuardrailAction(ID, true);

    expect(result).toEqual({ ok: true });
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.guardrail.toggled',
        before: { enabled: false },
        after: { enabled: true },
      }),
    );
  });
});

describe('deleting', () => {
  it('refuses to delete a built-in, and says to switch it off instead', async () => {
    // A deleted built-in leaves the resolver with no row for a detector the
    // code still knows about, which reads as an installation that never had
    // it rather than as a missing row.
    findFirst.mockResolvedValue({
      id: 1,
      publicId: ID,
      key: 'jailbreak-detection',
      kind: 'BUILT_IN',
      name: 'Jailbreak detection',
      stage: 'INPUT',
      action: 'LOG',
    });

    const result = await deleteGuardrailAction(ID);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Switch it off');
    }
    expect(del).not.toHaveBeenCalled();
  });

  it('deletes an operator’s own rule and records it', async () => {
    findFirst.mockResolvedValue({
      id: 1,
      publicId: ID,
      key: null,
      kind: 'PATTERN',
      name: 'Card numbers',
      stage: 'INPUT',
      action: 'LOG',
    });

    const result = await deleteGuardrailAction(ID);

    expect(result).toEqual({ ok: true });
    expect(del).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'admin.guardrail.deleted' }),
    );
  });
});

describe('every mutation is behind the admin guard', () => {
  it.each([
    ['create', () => createGuardrailAction(VALID)],
    ['update', () => updateGuardrailAction(ID, VALID)],
    ['toggle', () => toggleGuardrailAction(ID, true)],
    ['delete', () => deleteGuardrailAction(ID)],
  ])(
    '%s calls requireAdmin',
    async (_name, run) => {
      findFirst.mockResolvedValue({
        id: 1,
        publicId: ID,
        key: null,
        kind: 'PATTERN',
        name: 'x',
        stage: 'INPUT',
        action: 'LOG',
        enabled: false,
        pattern: null,
      });

      await run();

      expect(requireAdmin).toHaveBeenCalled();
    },
    20_000,
  );
});
