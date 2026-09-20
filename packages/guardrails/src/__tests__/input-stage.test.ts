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
  it('keeps the built-in that has an evaluator and drops the one that does not', async () => {
    // Two bugs, same silence, opposite causes — and this test asserted the
    // second one until a review caught it.
    //
    // First `SUPPORTED_COMBINATIONS` omitted `BUILT_IN`/`INPUT`, so the seeded
    // `content-moderation` rule was discarded while the panel showed it
    // enabled. Adding the combination fixed that and made
    // `jailbreak-detection` — the same kind and stage, with no evaluator —
    // resolve, be kept, match no branch, and be enforced by nothing. The
    // original version of this test expected exactly that, because it was
    // written to prove the first fix and took "both survive" as the goal.
    //
    // Support for a built-in is per key. `EVALUABLE_BUILT_IN_KEYS` is the
    // unit, and `jailbreak-detection` joins it in the phase that implements
    // it.
    const { resolveGuardrails } = await import('../resolver/resolve');
    const { BUILT_IN_GUARDRAIL_KEYS, EVALUABLE_BUILT_IN_KEYS } =
      await import('../contracts/guardrail');

    const resolution = resolveGuardrails({
      platformRules: BUILT_IN_GUARDRAIL_KEYS.map((key) => ({
        ...rule({ publicId: key, kind: 'BUILT_IN', key, pattern: null }),
        organizationId: null,
      })),
    });

    expect(resolution.rules.map((r) => r.publicId)).toEqual([
      ...EVALUABLE_BUILT_IN_KEYS,
    ]);
    expect(resolution.dropped).toEqual(
      BUILT_IN_GUARDRAIL_KEYS.filter(
        (key) => !(EVALUABLE_BUILT_IN_KEYS as readonly string[]).includes(key),
      ).map((key) => ({
        reason: 'built-in-has-no-evaluator',
        guardrailPublicId: key,
      })),
    );
  });

  it('every evaluable built-in has a branch in this stage', async () => {
    // The binding between the list and the code that reads it. A key added to
    // `EVALUABLE_BUILT_IN_KEYS` without a branch here is a rule the resolver
    // keeps and nothing acts on — which is the state this whole test block
    // exists to make impossible.
    const { EVALUABLE_BUILT_IN_KEYS } = await import('../contracts/guardrail');
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(
      new URL('../evaluator/input-stage.ts', import.meta.url),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '');

    for (const key of EVALUABLE_BUILT_IN_KEYS) {
      expect(
        source.includes(`'${key}'`),
        `${key} is listed as evaluable but input-stage.ts never names it`,
      ).toBe(true);
    }
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

describe('the per-turn budget', () => {
  it('reports every rule it could not run', async () => {
    // Deterministic, which the first attempt at this was not: with a zero
    // budget the check between rules fails on the first one, so every rule is
    // skipped regardless of how fast the machine is.
    const many = Array.from({ length: 5 }, (_, i) =>
      rule({ publicId: `rule-${i}`, pattern: `needle-${i}` }),
    );

    await evaluateInputStage(
      many,
      { question: 'needle-0', chatHistory: '', moderateHistory: false },
      deps,
      { budgetMs: 0 },
    );

    expect(onBudgetExhausted).toHaveBeenCalledTimes(1);
    const [skipped] = onBudgetExhausted.mock.calls[0] as [
      ResolvedGuardrail[],
      number,
    ];
    expect(skipped.map((r) => r.publicId)).toEqual(many.map((r) => r.publicId));
  });

  it('reports the resolved rules, not the raw ones', async () => {
    // The callback is what a runtime logs from, and a bare `GuardrailRule` has
    // no severity or source on it. Passing the wrong object would make the log
    // line right and useless.
    await evaluateInputStage(
      [rule({ publicId: 'only', severity: 'critical' })],
      { question: 'x', chatHistory: '', moderateHistory: false },
      deps,
      { budgetMs: 0 },
    );

    const [skipped] = onBudgetExhausted.mock.calls[0] as [
      ResolvedGuardrail[],
      number,
    ];
    expect(skipped[0].severity).toBe('critical');
    expect(skipped[0].sources).toBeDefined();
  });

  it('says nothing when every rule ran', async () => {
    await evaluateInputStage(
      [rule()],
      { question: 'nothing here', chatHistory: '', moderateHistory: false },
      deps,
    );

    expect(onBudgetExhausted).not.toHaveBeenCalled();
  });

  it('skips a rule rather than refusing the turn', async () => {
    // A `BLOCK` rule that never ran must not block. Exhausting the budget is a
    // capacity problem, and turning it into a refusal would make a slow turn
    // look like a policy decision.
    const result = await evaluateInputStage(
      [rule({ action: 'BLOCK', pattern: 'hunter2' })],
      { question: 'hunter2', chatHistory: '', moderateHistory: false },
      deps,
      { budgetMs: 0 },
    );

    expect(result.blockedBy).toBeUndefined();
  });
});

describe('the question and the history share one budget', () => {
  /**
   * A clock that advances a fixed step on every read.
   *
   * `runPatternRules` reads it three times per call — start, the per-rule
   * check, and the elapsed total — so a step of five against a budget of ten
   * lets the question pass finish having spent the whole budget, and leaves
   * the history nothing. Without controlling it, "the history got what was
   * left" is a claim about how fast this machine is.
   */
  const steppingClock = (step: number) => {
    let t = 0;
    return () => {
      const value = t;
      t += step;
      return value;
    };
  };

  const maskRule = rule({
    publicId: 'mask-1',
    action: 'MASK',
    pattern: 'hunter2',
  });

  it('does not hand the history a fresh budget', async () => {
    // The history is every stored message concatenated — the slowest input
    // the stage ever sees — so a second full budget made the real ceiling
    // twice the documented number.
    const result = await evaluateInputStage(
      [maskRule],
      {
        question: 'nothing here',
        chatHistory: 'the password is hunter2',
        moderateHistory: false,
      },
      deps,
      { budgetMs: 10, now: steppingClock(5) },
    );

    // Unmasked, because the rule never ran: the question spent the budget.
    // Under a fresh budget it would have run and returned '***' here, which
    // is what this asserts against.
    expect(result.chatHistory).toBe('the password is hunter2');
  });

  it('reports the history rules it had no budget for', async () => {
    // These were dropped on the floor: only `.hits` was read from the history
    // run, so a MASK rule that did not get to run was not applied and said
    // nothing. A mask silently not applied is the exact failure this feature
    // exists to make visible.
    await evaluateInputStage(
      [maskRule],
      {
        question: 'nothing here',
        chatHistory: 'the password is hunter2',
        moderateHistory: false,
      },
      deps,
      { budgetMs: 10, now: steppingClock(5) },
    );

    expect(onBudgetExhausted).toHaveBeenCalledTimes(1);
    const [skipped] = onBudgetExhausted.mock.calls[0] as [
      ResolvedGuardrail[],
      number,
    ];
    expect(skipped.map((r) => r.publicId)).toEqual(['mask-1']);
  });

  it('still masks the history when the budget has room', async () => {
    // The guard on the guard: a change that simply stopped running the
    // history pass would satisfy both assertions above.
    const result = await evaluateInputStage(
      [maskRule],
      {
        question: 'nothing here',
        chatHistory: 'the password is hunter2',
        moderateHistory: false,
      },
      deps,
      { budgetMs: 10_000, now: steppingClock(1) },
    );

    expect(result.chatHistory).not.toContain('hunter2');
    expect(onBudgetExhausted).not.toHaveBeenCalled();
  });
});
