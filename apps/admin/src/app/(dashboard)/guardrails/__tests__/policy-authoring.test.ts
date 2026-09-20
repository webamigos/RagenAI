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

  const RENAME = {
    name: 'Jailbreak detection (tuned)',
    kind: 'BUILT_IN' as const,
    stage: 'INPUT' as const,
    action: 'BLOCK' as const,
    severity: 'critical' as const,
  };

  /**
   * `jailbreak-detection` is a *scored* built-in, and as of C4 its
   * `threshold` is the operator's to set — the column the resolver has always
   * read and nothing could write.
   */
  it('tunes a scored built-in’s threshold', async () => {
    const result = await updateGuardrailAction('gr-builtin', {
      ...RENAME,
      threshold: 0.55,
    });

    expect(result).toEqual({ ok: true });
    expect(dataOf(update)).toMatchObject({ threshold: 0.55 });
  });

  /**
   * The half C4 must not break, and nearly did. `undefined` is the key not
   * being in the request — a stale tab, or a hand-made one — and writing
   * `null` for it resets a tuned detector to the default as a side effect of
   * renaming it. `null` is an operator clearing the field on purpose, which
   * is a different instruction and stored as such.
   */
  it('leaves the threshold alone when the request does not carry one', async () => {
    await updateGuardrailAction('gr-builtin', RENAME);

    expect(dataOf(update)).not.toHaveProperty('threshold');
  });

  it('clears the threshold to the default when one is explicitly cleared', async () => {
    await updateGuardrailAction('gr-builtin', { ...RENAME, threshold: null });

    expect(dataOf(update)).toMatchObject({ threshold: null });
  });

  /**
   * A built-in's question is fixed in code. Storing prose on one would keep
   * text no judge is ever handed, on a row an operator would then believe
   * they had written.
   */
  it('never writes prose onto a built-in', async () => {
    await updateGuardrailAction('gr-builtin', {
      ...RENAME,
      policy: 'something an operator typed',
    });

    expect(dataOf(update)).not.toHaveProperty('policy');
  });

  it('refuses a threshold outside 0–1 rather than letting the resolver drop it', async () => {
    // The resolver's answer to a bad value is to ignore it and carry on —
    // right at runtime, useless at authoring time, because the save would
    // report success and the number would never apply.
    const result = await updateGuardrailAction('gr-builtin', {
      ...RENAME,
      threshold: 1.5,
    });

    expect(result.ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('a built-in whose verdict is not a score', () => {
  beforeEach(() => {
    findFirst.mockResolvedValue({
      id: 3,
      publicId: 'gr-moderation',
      key: 'content-moderation',
      kind: 'BUILT_IN',
      stage: 'INPUT',
      name: 'Content moderation',
      action: 'BLOCK',
      pattern: null,
      enabled: true,
    });
  });

  /**
   * Support is per **key**, not per kind, and conflating the two has been a
   * bug in `contracts/guardrail.ts` in both directions. `content-moderation`
   * asks a provider endpoint that answers with a flag — a threshold on it is
   * a column nothing reads, and a field for it would be a number an operator
   * would reasonably believe they had tuned.
   */
  it('is not given a threshold, even when a request carries one', async () => {
    await updateGuardrailAction('gr-moderation', {
      name: 'Content moderation',
      kind: 'BUILT_IN',
      stage: 'INPUT',
      action: 'BLOCK',
      severity: 'warn',
      threshold: 0.4,
    });

    expect(dataOf(update)).not.toHaveProperty('threshold');
  });
});
