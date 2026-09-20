import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGuardrailFindMany = vi.fn();
const mockOverrideFindMany = vi.fn();
const mockLoggerError = vi.fn();
const mockLoggerWarn = vi.fn();
const mockGuardrailsDisabled = vi.fn(() => false);
const mockIsOnPremise = vi.fn(() => false);

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    guardrail: { findMany: (...a: unknown[]) => mockGuardrailFindMany(...a) },
    guardrailOrgOverride: {
      findMany: (...a: unknown[]) => mockOverrideFindMany(...a),
    },
  },
}));

vi.mock('@ragenai/env', () => ({
  guardrailsDisabled: () => mockGuardrailsDisabled(),
  isOnPremise: () => mockIsOnPremise(),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    error: (...a: unknown[]) => mockLoggerError(...a),
    warn: (...a: unknown[]) => mockLoggerWarn(...a),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

const { clearGuardrailCache, getOrgGuardrailsQuery, guardrailWhere } =
  await import('../services/queries/get-org-guardrails-query');

const ORG = 'org-1';

/** A platform PATTERN/INPUT rule, which is the one combination B2 can evaluate. */
const patternRule = (over: Record<string, unknown> = {}) => ({
  publicId: 'rule-1',
  organizationId: null,
  key: null,
  name: 'A pattern rule',
  description: null,
  kind: 'PATTERN',
  stage: 'INPUT',
  action: 'LOG',
  enabled: true,
  severity: 'warn',
  pattern: 'forbidden',
  patternIsRegex: false,
  threshold: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGuardrailsDisabled.mockReturnValue(false);
  mockIsOnPremise.mockReturnValue(false);
  mockGuardrailFindMany.mockResolvedValue([]);
  mockOverrideFindMany.mockResolvedValue([]);
  clearGuardrailCache();
});

describe('guardrailWhere', () => {
  it('asks for the organization s own rules and the platform s', () => {
    // The spec singles this out: `Guardrail` is deliberately absent from
    // TENANT_SCOPED_MODELS because this OR shape would make the guard warn on
    // the hottest query in the product. So the shape is asserted here, since
    // nothing else will.
    expect(guardrailWhere(ORG)).toEqual({
      OR: [{ organizationId: ORG }, { organizationId: null }],
    });
  });

  it('never asks for another organization s rules', () => {
    const where = guardrailWhere(ORG);
    const orgIds = where.OR.map((clause) => clause.organizationId);

    // A regression here is a cross-org data leak on a security feature, which
    // is worth stating as its own assertion rather than trusting the toEqual
    // above to be read carefully.
    expect(orgIds).not.toContain('some-other-org');
    expect(new Set(orgIds)).toEqual(new Set([ORG, null]));
  });
});

describe('getOrgGuardrailsQuery', () => {
  it('returns the enabled input rules', async () => {
    mockGuardrailFindMany.mockResolvedValue([patternRule()]);

    const result = await getOrgGuardrailsQuery(ORG);

    expect(result.input).toHaveLength(1);
    expect(result.output).toHaveLength(0);
    expect(result.degraded).toBe(false);
  });

  it('drops a rule an operator switched off', async () => {
    mockGuardrailFindMany.mockResolvedValue([patternRule({ enabled: false })]);

    const result = await getOrgGuardrailsQuery(ORG);

    // Carried with a flag instead of dropped, every consumer has to remember
    // to check it, and the one that forgets enforces a disabled rule.
    expect(result.input).toEqual([]);
  });

  it('reports a MASK input rule, because it changes how the stage is scheduled', async () => {
    mockGuardrailFindMany.mockResolvedValue([patternRule({ action: 'MASK' })]);

    const result = await getOrgGuardrailsQuery(ORG);

    expect(result.hasTransformingInputRule).toBe(true);
  });

  it('does not report one for a rule that only judges', async () => {
    mockGuardrailFindMany.mockResolvedValue([
      patternRule({ action: 'LOG' }),
      patternRule({ publicId: 'rule-2', action: 'BLOCK' }),
    ]);

    const result = await getOrgGuardrailsQuery(ORG);

    // The concurrency with rephraseAndExpand survives for these, and this is
    // the assertion that keeps the optimisation honest.
    expect(result.hasTransformingInputRule).toBe(false);
  });
});

describe('the cache', () => {
  it('reads the database once for repeated turns', async () => {
    mockGuardrailFindMany.mockResolvedValue([patternRule()]);

    await getOrgGuardrailsQuery(ORG);
    await getOrgGuardrailsQuery(ORG);
    await getOrgGuardrailsQuery(ORG);

    expect(mockGuardrailFindMany).toHaveBeenCalledTimes(1);
  });

  it('keys by organization, so one org cannot serve another s rules', async () => {
    mockGuardrailFindMany.mockResolvedValue([patternRule()]);

    await getOrgGuardrailsQuery(ORG);
    await getOrgGuardrailsQuery('org-2');

    expect(mockGuardrailFindMany).toHaveBeenCalledTimes(2);
    expect(mockGuardrailFindMany).toHaveBeenLastCalledWith({
      where: guardrailWhere('org-2'),
    });
  });

  it('re-reads once the entry has expired', async () => {
    vi.useFakeTimers();
    try {
      mockGuardrailFindMany.mockResolvedValue([patternRule()]);

      await getOrgGuardrailsQuery(ORG);
      // The window the break-glass documentation promises: a rule switched off
      // in the panel takes effect within a minute.
      vi.advanceTimersByTime(60_001);
      await getOrgGuardrailsQuery(ORG);

      expect(mockGuardrailFindMany).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('when the database cannot be reached', () => {
  beforeEach(() => {
    mockGuardrailFindMany.mockRejectedValue(new Error('connection refused'));
  });

  it('fails open rather than taking chat down', async () => {
    const result = await getOrgGuardrailsQuery(ORG);

    // Fail-closed was rejected: a blip would refuse every tenant's turn, and
    // the state this falls back to is the state every installation is in
    // today.
    expect(result.input).toEqual([]);
    expect(result.output).toEqual([]);
  });

  it('says the set is empty because of a failure, not because it is unconfigured', async () => {
    const result = await getOrgGuardrailsQuery(ORG);

    // The two are indistinguishable downstream and must not be: "no rules" is
    // the steady state, "could not read the rules" is an incident.
    expect(result.degraded).toBe(true);
  });

  it('logs with audit:true instead of recording a security event', async () => {
    await getOrgGuardrailsQuery(ORG);

    expect(mockLoggerError).toHaveBeenCalledTimes(1);
    const [context] = mockLoggerError.mock.calls[0] as [
      Record<string, unknown>,
      string,
    ];
    // `recordSecurityEvent` writes to the database that just failed to answer,
    // so an event is the one alarm this failure would swallow.
    expect(context.audit).toBe(true);
    expect(context.organizationId).toBe(ORG);
  });

  it('does not retry on every turn while the database is down', async () => {
    await getOrgGuardrailsQuery(ORG);
    await getOrgGuardrailsQuery(ORG);

    // Without a short negative cache, each turn pays a connection timeout
    // before failing open — a degraded database becomes a degraded chat.
    expect(mockGuardrailFindMany).toHaveBeenCalledTimes(1);
  });

  it('retries sooner than it would refresh a successful load', async () => {
    vi.useFakeTimers();
    try {
      await getOrgGuardrailsQuery(ORG);
      // The negative window is the interval in which guardrails are not
      // enforced, so it is seconds rather than the minute a success gets.
      vi.advanceTimersByTime(5_001);
      await getOrgGuardrailsQuery(ORG);

      expect(mockGuardrailFindMany).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('a row the resolver discarded', () => {
  it('is said out loud, because nothing else will say it', async () => {
    // An override pointing at a rule that is not a platform rule: the admin
    // action refuses to create one, and the resolver drops it if a row exists
    // anyway. Dropped is the dangerous state — the panel shows the rule as
    // configured because it reports what is stored, and only the runtime
    // knows it threw the row away.
    mockGuardrailFindMany.mockResolvedValue([patternRule()]);
    mockOverrideFindMany.mockResolvedValue([
      {
        guardrail: { publicId: 'not-a-platform-rule' },
        enabled: false,
        action: null,
        threshold: null,
        origin: null,
      },
    ]);

    await getOrgGuardrailsQuery(ORG);

    const warned = mockLoggerWarn.mock.calls.find(([, message]) =>
      String(message).includes('discarded'),
    );
    expect(warned, 'no warning named the discarded row').toBeDefined();
    expect((warned![0] as { audit?: boolean }).audit).toBe(true);
  });

  it('says nothing when the resolver kept everything', async () => {
    mockGuardrailFindMany.mockResolvedValue([patternRule()]);

    await getOrgGuardrailsQuery(ORG);

    expect(
      mockLoggerWarn.mock.calls.filter(([, m]) =>
        String(m).includes('discarded'),
      ),
    ).toEqual([]);
  });
});

describe('the break-glass', () => {
  it('returns nothing without touching the database', async () => {
    mockGuardrailsDisabled.mockReturnValue(true);
    mockGuardrailFindMany.mockResolvedValue([patternRule()]);

    const result = await getOrgGuardrailsQuery(ORG);

    expect(result.input).toEqual([]);
    expect(mockGuardrailFindMany).not.toHaveBeenCalled();
  });

  it('is not defeated by an entry cached before it was set', async () => {
    mockGuardrailFindMany.mockResolvedValue([patternRule()]);
    const before = await getOrgGuardrailsQuery(ORG);
    expect(before.input).toHaveLength(1);

    // A restart is what actually sets the variable, so this is belt and
    // braces — but a cache checked before the switch is a switch that does
    // not work for up to a minute, during an incident.
    mockGuardrailsDisabled.mockReturnValue(true);

    expect((await getOrgGuardrailsQuery(ORG)).input).toEqual([]);
  });

  it('is not reported as degraded, because nothing failed', async () => {
    mockGuardrailsDisabled.mockReturnValue(true);

    expect((await getOrgGuardrailsQuery(ORG)).degraded).toBe(false);
  });
});
