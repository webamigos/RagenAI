import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const groupBy = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    securityEvent: {
      groupBy: (...a: unknown[]) => groupBy(...a),
    },
  },
}));

const { getGuardrailHitCounts } = await import('../hit-counts');
const { HIT_WINDOW_DAYS } = await import('../hit-window');

type Args = {
  by: string[];
  where: {
    eventType: { in: string[] };
    createdAt: { gte: Date };
    metadata: { path: string[]; equals: string };
  };
};

function argsOf(call: number): Args {
  return groupBy.mock.calls[call][0] as Args;
}

/** A `groupBy` result, in the shape Prisma returns it. */
function counted(rows: Record<string, number>) {
  return Object.entries(rows).map(([eventType, hits]) => ({
    eventType,
    _count: { _all: hits },
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'admin-1' });
  groupBy.mockResolvedValue([]);
});

describe('getGuardrailHitCounts', () => {
  it('is behind the admin guard, like every other read on this page', async () => {
    requireAdmin.mockRejectedValue(new Error('not an admin'));

    await expect(getGuardrailHitCounts(['rule-a'])).rejects.toThrow(
      'not an admin',
    );
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('asks nothing when there are no rules to ask about', async () => {
    await expect(getGuardrailHitCounts([])).resolves.toEqual({});
    expect(groupBy).not.toHaveBeenCalled();
  });

  it('counts both guardrail event types and nothing else', async () => {
    await getGuardrailHitCounts(['rule-a']);

    // Counting only the blocks would report a `LOG` rule — the whole point of
    // observation mode — as doing nothing, which is the reading an operator
    // would act on by deleting it.
    expect(argsOf(0).where.eventType.in).toEqual([
      'GUARDRAIL_BLOCKED',
      'GUARDRAIL_FLAGGED',
    ]);
  });

  it('matches a hit by the rule id the recorders write', async () => {
    await getGuardrailHitCounts(['rule-a']);

    // `metadata.guardrail` is the publicId. Matching on `rule` — the name —
    // would split a rule's history the day somebody renames it.
    expect(argsOf(0).where.metadata).toEqual({
      path: ['guardrail'],
      equals: 'rule-a',
    });
  });

  it('asks for the last seven days', async () => {
    const before = Date.now();
    await getGuardrailHitCounts(['rule-a']);

    const expected = before - HIT_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const asked = argsOf(0).where.createdAt.gte.getTime();
    expect(asked).toBeGreaterThanOrEqual(expected - 5_000);
    expect(asked).toBeLessThanOrEqual(expected + 5_000);
  });

  it('splits the two event types into the two columns the page shows', async () => {
    groupBy.mockResolvedValue(
      counted({ GUARDRAIL_BLOCKED: 3, GUARDRAIL_FLAGGED: 4 }),
    );

    await expect(getGuardrailHitCounts(['rule-a'])).resolves.toEqual({
      'rule-a': { blocked: 3, flagged: 4 },
    });
  });

  it('counts a guardrail event that is neither as flagged, not as nothing', async () => {
    // A third member — an output refusal, a judge that failed open — must land
    // somewhere. Falling out of both columns would under-report a rule while
    // every number on the page still looked plausible.
    groupBy.mockResolvedValue(counted({ GUARDRAIL_SOMETHING_NEW: 2 }));

    await expect(getGuardrailHitCounts(['rule-a'])).resolves.toEqual({
      'rule-a': { blocked: 0, flagged: 0 },
    });
  });

  it('reports a rule with no hits as zero rather than omitting it', async () => {
    await expect(getGuardrailHitCounts(['rule-a', 'rule-b'])).resolves.toEqual({
      'rule-a': { blocked: 0, flagged: 0 },
      'rule-b': { blocked: 0, flagged: 0 },
    });
  });

  it('asks once per rule, and keeps each answer with its own rule', async () => {
    groupBy.mockImplementation((args: Args) =>
      Promise.resolve(
        args.where.metadata.equals === 'rule-a'
          ? counted({ GUARDRAIL_BLOCKED: 1 })
          : counted({ GUARDRAIL_FLAGGED: 5 }),
      ),
    );

    await expect(getGuardrailHitCounts(['rule-a', 'rule-b'])).resolves.toEqual({
      'rule-a': { blocked: 1, flagged: 0 },
      'rule-b': { blocked: 0, flagged: 5 },
    });
    expect(groupBy).toHaveBeenCalledTimes(2);
  });
});
