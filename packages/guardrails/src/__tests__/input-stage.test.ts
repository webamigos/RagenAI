import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateInputStage,
  isModerationRule,
  type InputStageDeps,
} from '../evaluator/input-stage';
import type { ResolvedGuardrail } from '../resolver/resolve';

/**
 * The input stage, tested here rather than only through an app's binding.
 *
 * This function is the single point of truth for what a rule does, in both
 * runtimes. Testing it only through `apps/web` would mean `apps/api`'s
 * behaviour rests on a suite that does not mention it — and the public API is
 * the surface where a silent difference would go unnoticed longest.
 */

const rule = (over: Partial<ResolvedGuardrail> = {}): ResolvedGuardrail =>
  ({
    publicId: 'rule-1',
    organizationId: null,
    key: null,
    name: 'Secrets',
    description: null,
    kind: 'PATTERN',
    stage: 'INPUT',
    action: 'LOG',
    enabled: true,
    severity: 'warn',
    pattern: 'hunter2',
    patternIsRegex: false,
    threshold: null,
    isPlatformRule: true,
    sources: {
      enabled: 'platform-rule',
      action: 'platform-rule',
      threshold: 'platform-rule',
    },
    ...over,
  }) as ResolvedGuardrail;

const builtIn = (over: Partial<ResolvedGuardrail> = {}) =>
  rule({
    publicId: 'mod-1',
    kind: 'BUILT_IN',
    key: 'content-moderation',
    name: 'Content moderation',
    pattern: null,
    ...over,
  });

let deps: InputStageDeps;
let moderate: ReturnType<typeof vi.fn>;
let record: ReturnType<typeof vi.fn>;
let onBudgetExhausted: ReturnType<typeof vi.fn>;

beforeEach(() => {
  moderate = vi.fn().mockResolvedValue({ outcome: 'pass' });
  record = vi.fn();
  onBudgetExhausted = vi.fn();
  deps = { moderate, record, onBudgetExhausted };
});

const evaluate = (
  rules: ResolvedGuardrail[],
  input: Partial<Parameters<typeof evaluateInputStage>[1]> = {},
) =>
  evaluateInputStage(
    rules,
    {
      question: 'hello',
      chatHistory: '',
      moderateHistory: false,
      ...input,
    },
    deps,
  );

describe('an empty rule set', () => {
  it('is the off switch: no verdict, no provider call, no event', async () => {
    const result = await evaluate([], { question: 'anything' });

    expect(result.question).toBe('anything');
    expect(result.blockedBy).toBeUndefined();
    expect(moderate).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
});

describe('BLOCK', () => {
  it('reports the rule rather than throwing', async () => {
    // Reported, not thrown, because the two runtimes throw different error
    // types — apps/web localizes, apps/api returns a code.
    const result = await evaluate([rule({ action: 'BLOCK' })], {
      question: 'hunter2',
    });

    expect(result.blockedBy?.publicId).toBe('rule-1');
  });

  it('leaves the text alone, since nobody will read it', async () => {
    const result = await evaluate([rule({ action: 'BLOCK' })], {
      question: 'say hunter2',
    });

    expect(result.question).toBe('say hunter2');
  });

  it('wins over a mask rule that also matched', async () => {
    const result = await evaluate(
      [
        rule({ publicId: 'mask', action: 'MASK', pattern: 'hunter2' }),
        rule({ publicId: 'block', action: 'BLOCK', pattern: 'hunter2' }),
      ],
      { question: 'hunter2' },
    );

    expect(result.blockedBy?.publicId).toBe('block');
    // Masking text for a turn that is about to be refused is wasted work, and
    // the event for the mask would describe a turn that never happened.
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('skips the provider once a pattern has refused', async () => {
    await evaluate([rule({ action: 'BLOCK' }), builtIn()], {
      question: 'hunter2',
    });

    // A local regex that already refuses should not be preceded by a network
    // round-trip.
    expect(moderate).not.toHaveBeenCalled();
  });
});

describe('the built-in detector', () => {
  it('is asked only when the organization has it enabled', async () => {
    await evaluate([rule()], { question: 'hunter2' });
    expect(moderate).not.toHaveBeenCalled();

    await evaluate([builtIn()]);
    expect(moderate).toHaveBeenCalledTimes(1);
  });

  it('sees the history only when the chain says so', async () => {
    await evaluate([builtIn()], {
      question: 'q',
      chatHistory: 'h',
      moderateHistory: true,
    });
    expect(moderate).toHaveBeenCalledWith('q h');

    moderate.mockClear();
    await evaluate([builtIn()], {
      question: 'q',
      chatHistory: 'h',
      moderateHistory: false,
    });
    expect(moderate).toHaveBeenCalledWith('q');
  });

  it('refuses on a hit when set to BLOCK', async () => {
    moderate.mockResolvedValue({ outcome: 'hit' });
    const result = await evaluate([builtIn({ action: 'BLOCK' })]);

    expect(result.blockedBy?.publicId).toBe('mod-1');
  });

  it('records but lets the turn through when set to LOG', async () => {
    moderate.mockResolvedValue({ outcome: 'hit' });
    const result = await evaluate([builtIn({ action: 'LOG' })]);

    expect(result.blockedBy).toBeUndefined();
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('treats an error as neither a pass nor a hit', async () => {
    moderate.mockResolvedValue({ outcome: 'error', reason: 'down' });
    const result = await evaluate([builtIn({ action: 'BLOCK' })]);

    // A classifier that can take the product down is a bigger risk than the
    // one it catches — and an outage must not read as flagged content.
    expect(result.blockedBy).toBeUndefined();
    expect(record).not.toHaveBeenCalled();
  });
});

describe('MASK', () => {
  it('rewrites the question', async () => {
    const result = await evaluate([rule({ action: 'MASK' })], {
      question: 'my password is hunter2',
    });

    expect(result.question).not.toContain('hunter2');
    expect(result.question).toContain('my password is');
  });

  it('masks the history against every mask rule, not only matched ones', async () => {
    // The case masking exists for: the secret is in turn one's history and
    // turn two's question is innocent. A history derived from the question's
    // hits is never masked, so the rule protects one turn and then stops.
    const result = await evaluate([rule({ action: 'MASK' })], {
      question: 'and again',
      chatHistory: 'user: my password is hunter2',
    });

    expect(result.chatHistory).not.toContain('hunter2');
  });

  it('counts spans across both halves as one rule firing', async () => {
    await evaluate([rule({ action: 'MASK' })], {
      question: 'hunter2',
      chatHistory: 'hunter2 and hunter2',
    });

    expect(record).toHaveBeenCalledTimes(1);
    expect((record.mock.calls[0][0] as { matchCount: number }).matchCount).toBe(
      3,
    );
  });

  it('returns the text unchanged when nothing matched anywhere', async () => {
    const result = await evaluate([rule({ action: 'MASK' })], {
      question: 'nothing',
      chatHistory: 'also nothing',
    });

    expect(result).toEqual({
      question: 'nothing',
      chatHistory: 'also nothing',
    });
  });
});

describe('LOG', () => {
  it('records one event per matching rule with its span count', async () => {
    await evaluate(
      [
        rule({ publicId: 'a', pattern: 'hunter2' }),
        rule({ publicId: 'b', pattern: 'secret' }),
        rule({ publicId: 'c', pattern: 'absent' }),
      ],
      { question: 'hunter2 and secret and hunter2' },
    );

    expect(record).toHaveBeenCalledTimes(2);
    const counts = record.mock.calls.map(
      (call) => (call[0] as { matchCount: number }).matchCount,
    );
    expect(counts.sort()).toEqual([1, 2]);
  });
});

describe('isModerationRule', () => {
  it('needs the kind and the key together', async () => {
    expect(isModerationRule(builtIn())).toBe(true);
    expect(
      isModerationRule(rule({ kind: 'PATTERN', key: 'content-moderation' })),
    ).toBe(false);
  });
});

describe('a supported combination is evaluable', () => {
  it('keeps the seeded built-ins rather than dropping them', async () => {
    // The bug this exists for: `SUPPORTED_COMBINATIONS` listed only
    // PATTERN/INPUT while the two seeded detectors are BUILT_IN/INPUT, so the
    // runtime resolver discarded `content-moderation` as unsupported. An
    // operator enabled moderation, the panel showed it enabled, nothing ran,
    // and `guardrails:preflight` called the configuration reconciled.
    const { resolveGuardrails } = await import('../resolver/resolve');
    const { BUILT_IN_GUARDRAIL_KEYS } = await import('../contracts/guardrail');

    const resolution = resolveGuardrails({
      platformRules: BUILT_IN_GUARDRAIL_KEYS.map((key) => ({
        ...rule({ publicId: key, kind: 'BUILT_IN', key, pattern: null }),
        organizationId: null,
      })),
    });

    expect(resolution.dropped).toEqual([]);
    expect(resolution.rules.map((r) => r.publicId)).toEqual([
      ...BUILT_IN_GUARDRAIL_KEYS,
    ]);
  });

  it('is a superset of what an operator may author', async () => {
    // Authoring is the narrower question: a built-in is seeded, so a new one
    // an operator typed would have no key and no detector behind it. Anything
    // authorable must nonetheless be evaluable, or the form offers a rule the
    // runtime throws away.
    const { AUTHORABLE_COMBINATIONS, isCombinationSupported } =
      await import('../contracts/guardrail');

    for (const combination of AUTHORABLE_COMBINATIONS) {
      expect(
        isCombinationSupported(combination.kind, combination.stage),
        `${combination.kind}/${combination.stage} can be authored but not evaluated`,
      ).toBe(true);
    }
  });
});
