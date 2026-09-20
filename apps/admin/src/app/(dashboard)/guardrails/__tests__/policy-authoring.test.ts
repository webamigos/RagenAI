import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const findFirst = vi.fn();
const create = vi.fn();
const update = vi.fn();

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
      findMany: vi.fn(),
      findFirst: (...a: unknown[]) => findFirst(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
      delete: vi.fn(),
    },
  },
}));

const { createGuardrailAction, updateGuardrailAction } =
  await import('../actions');

const ADMIN = { id: 'admin-1', email: 'a@example.com' };

const POLICY = {
  name: 'No competitor pricing',
  kind: 'LLM_POLICY' as const,
  stage: 'INPUT' as const,
  action: 'LOG' as const,
  severity: 'warn' as const,
  policy: 'Never discuss a competitor’s pricing.',
  threshold: 0.8,
};

const dataOf = (mock: typeof create) =>
  (mock.mock.calls[0]![0] as { data: Record<string, unknown> }).data;

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(ADMIN);
  create.mockResolvedValue({
    id: 1,
    publicId: 'gr-1',
    name: POLICY.name,
    kind: 'LLM_POLICY',
    stage: 'INPUT',
    action: 'LOG',
  });
  update.mockResolvedValue({
    id: 1,
    publicId: 'gr-1',
    name: POLICY.name,
    stage: 'INPUT',
    action: 'LOG',
    pattern: null,
  });
});

describe('authoring a policy rule', () => {
  /**
   * C3's premise. `LLM_POLICY` has been *supported* since C1 and the action
   * validates against what may be **authored**, which until now did not
   * include it — a policy rule saved before the form had a prose field would
   * have been written with no `policy`, and that row is the one the resolver
   * drops while the page shows it enabled.
   */
  it('is accepted now that the form has a field for the prose', async () => {
    expect(await createGuardrailAction(POLICY)).toEqual({ ok: true });
    expect(dataOf(create)).toMatchObject({
      policy: POLICY.policy,
      threshold: 0.8,
    });
  });

  it.each([
    ['no policy at all', { ...POLICY, policy: undefined }],
    ['whitespace', { ...POLICY, policy: '   \n ' }],
  ])('refuses a rule with %s', async (_label, input) => {
    const result = await createGuardrailAction(input);

    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([-1, 2, Number.NaN])('refuses %p as a threshold', async (bad) => {
    const result = await createGuardrailAction({ ...POLICY, threshold: bad });

    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  /**
   * An empty threshold field is a choice to inherit the judge's default, and
   * `Number('')` is 0 — a threshold that matches every message. Stored as
   * `null` so `policyThresholdFor` supplies the default rather than the form
   * accidentally supplying the most aggressive value there is.
   */
  it('stores an unset threshold as null, never as zero', async () => {
    await createGuardrailAction({ ...POLICY, threshold: undefined });

    expect(dataOf(create).threshold).toBeNull();
  });

  it('never stores a pattern on a policy rule', async () => {
    // A Server Action takes whatever JSON reached it. The form sends
    // `undefined`; a hand-made request does not have to.
    await createGuardrailAction({
      ...POLICY,
      pattern: '\\d+',
      patternIsRegex: true,
    });

    expect(dataOf(create)).toMatchObject({
      pattern: null,
      patternIsRegex: false,
    });
  });
});

describe('switching a rule between kinds', () => {
  beforeEach(() => {
    findFirst.mockResolvedValue({
      id: 1,
      publicId: 'gr-1',
      key: null,
      kind: 'LLM_POLICY',
      stage: 'INPUT',
      name: POLICY.name,
      action: 'LOG',
      pattern: null,
      enabled: false,
    });
  });

  it('clears the prose when a policy rule becomes a pattern one', async () => {
    // Otherwise a rule switched to `PATTERN` and back would quietly come back
    // with a policy the operator had stopped looking at.
    await updateGuardrailAction('gr-1', {
      name: POLICY.name,
      kind: 'PATTERN',
      stage: 'INPUT',
      action: 'LOG',
      severity: 'warn',
      pattern: '\\d{4}',
      patternIsRegex: true,
    });

    expect(dataOf(update)).toMatchObject({ policy: null, threshold: null });
  });
});

describe('editing a built-in', () => {
  beforeEach(() => {
    findFirst.mockResolvedValue({
      id: 2,
      publicId: 'gr-builtin',
      key: 'jailbreak-detection',
      kind: 'BUILT_IN',
      stage: 'INPUT',
      name: 'Jailbreak detection',
      action: 'LOG',
      pattern: null,
      enabled: true,
    });
  });

  /**
   * `jailbreak-detection` is a *scored* built-in: `threshold` is its
   * sensitivity, and the resolver reads it. The form has no field for it, so
   * an edit sends nothing — and a write of `null` here would reset a tuned
   * detector to the default as a side effect of renaming it.
   */
  it('leaves a scored built-in’s threshold alone', async () => {
    const result = await updateGuardrailAction('gr-builtin', {
      name: 'Jailbreak detection (tuned)',
      kind: 'BUILT_IN',
      stage: 'INPUT',
      action: 'BLOCK',
      severity: 'critical',
    });

    expect(result).toEqual({ ok: true });
    const data = dataOf(update);
    expect(data).not.toHaveProperty('threshold');
    expect(data).not.toHaveProperty('policy');
  });
});
