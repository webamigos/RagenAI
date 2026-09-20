import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  evaluateOutputText,
  needsWholeAnswer,
  type OutputTextDeps,
} from '../evaluator/output-text';
import type { ResolvedGuardrail } from '../resolver/resolve';

/**
 * The buffered output stage: the answer is finished, so there is no window.
 *
 * Tested here rather than through either runtime, for the reason the input
 * stage's suite gives: this is the one place that decides what an output rule
 * does to a complete answer, and both `apps/web` and `apps/api` run it.
 */

const rule = (over: Partial<ResolvedGuardrail> = {}): ResolvedGuardrail =>
  ({
    publicId: 'rule-1',
    organizationId: null,
    key: null,
    name: 'Secrets',
    description: null,
    kind: 'PATTERN',
    stage: 'OUTPUT',
    action: 'LOG',
    enabled: true,
    severity: 'warn',
    pattern: 'hunter2',
    patternIsRegex: false,
    policy: null,
    threshold: null,
    isPlatformRule: true,
    sources: {
      enabled: 'platform-rule',
      action: 'platform-rule',
      threshold: 'platform-rule',
    },
    ...over,
  }) as ResolvedGuardrail;

const policy = (over: Partial<ResolvedGuardrail> = {}) =>
  rule({
    publicId: 'policy-1',
    kind: 'LLM_POLICY',
    name: 'No competitor pricing',
    pattern: null,
    policy: 'Never discuss a competitor’s pricing.',
    ...over,
  });

let judge: ReturnType<typeof vi.fn>;
let record: ReturnType<typeof vi.fn>;
let onBudgetExhausted: ReturnType<typeof vi.fn>;
let onPolicyCapExceeded: ReturnType<typeof vi.fn>;
let onJudgeError: ReturnType<typeof vi.fn>;
let deps: OutputTextDeps;

beforeEach(() => {
  judge = vi.fn().mockResolvedValue({ outcome: 'scored', score: 0 });
  record = vi.fn();
  onBudgetExhausted = vi.fn();
  onPolicyCapExceeded = vi.fn();
  onJudgeError = vi.fn();
  deps = {
    judge,
    record,
    onBudgetExhausted,
    onPolicyCapExceeded,
    onJudgeError,
  };
});

const ANSWER = 'the key is hunter2 and the door is open';

describe('needsWholeAnswer', () => {
  it('is true for a policy with prose, which is what makes a turn buffered', () => {
    expect(needsWholeAnswer([policy()])).toBe(true);
  });

  it('is false for pattern rules, which stream', () => {
    expect(needsWholeAnswer([rule(), rule({ action: 'MASK' })])).toBe(false);
  });

  it('is false for a policy with no prose, which cannot be judged at all', () => {
    // The resolver drops such a row, and a turn that buffered for it would
    // pay the whole latency of a judged answer for a rule that never runs.
    expect(needsWholeAnswer([policy({ policy: null })])).toBe(false);
  });
});

describe('evaluateOutputText', () => {
  it('leaves an answer alone when the organization has no rules', async () => {
    const result = await evaluateOutputText([], ANSWER, deps);

    expect(result.text).toBe(ANSWER);
    expect(result.blockedBy).toBeUndefined();
  });

  it('reports the rule that blocked, and does not rewrite the answer', async () => {
    // The text comes back untouched on a block: the caller withholds it and
    // stores a refusal, and handing back a half-masked answer would invite it
    // to show one.
    const blocking = rule({ action: 'BLOCK' });
    const result = await evaluateOutputText([blocking], ANSWER, deps);

    expect(result.blockedBy).toBe(blocking);
    expect(result.text).toBe(ANSWER);
    expect(record).toHaveBeenCalledWith({ rule: blocking });
  });

  it('masks what a MASK rule matched', async () => {
    const result = await evaluateOutputText(
      [rule({ action: 'MASK' })],
      ANSWER,
      deps,
    );

    expect(result.text).toBe(
      'the key is [[redacted:secrets]] and the door is open',
    );
    expect(record).toHaveBeenCalledWith({
      rule: expect.objectContaining({ publicId: 'rule-1' }),
      matchCount: 1,
    });
  });

  it('asks the judge, and blocks on a score past the threshold', async () => {
    judge.mockResolvedValue({ outcome: 'scored', score: 0.9 });
    const blocking = policy({ action: 'BLOCK', threshold: 0.7 });

    const result = await evaluateOutputText([blocking], ANSWER, deps);

    expect(result.blockedBy).toBe(blocking);
    expect(record).toHaveBeenCalledWith({ rule: blocking, score: 0.9 });
  });

  it('lets an answer through when the score is below the threshold', async () => {
    judge.mockResolvedValue({ outcome: 'scored', score: 0.4 });

    const result = await evaluateOutputText(
      [policy({ action: 'BLOCK', threshold: 0.7 })],
      ANSWER,
      deps,
    );

    expect(result.blockedBy).toBeUndefined();
    expect(result.text).toBe(ANSWER);
    expect(record).not.toHaveBeenCalled();
  });

  it('does not pay for a judge when a pattern already refused', async () => {
    // The input stage's ordering, and the same reason: a local regex that
    // already refuses the answer should not be preceded by one model call per
    // rule.
    await evaluateOutputText(
      [rule({ action: 'BLOCK' }), policy({ action: 'BLOCK' })],
      ANSWER,
      deps,
    );

    expect(judge).not.toHaveBeenCalled();
  });

  it('says so when a judge could not answer, and lets the turn through', async () => {
    // A classifier that can take the product down is a bigger risk than the
    // one it catches — and this is reported rather than recorded, because an
    // event says a rule *fired*.
    judge.mockResolvedValue({ outcome: 'error', reason: 'timeout' });

    const result = await evaluateOutputText([policy()], ANSWER, deps);

    expect(result.blockedBy).toBeUndefined();
    expect(onJudgeError).toHaveBeenCalledWith(
      expect.objectContaining({ publicId: 'policy-1' }),
      'timeout',
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('reports the policies it would not run, rather than dropping them', async () => {
    const rules = [
      policy({ publicId: 'p1' }),
      policy({ publicId: 'p2' }),
      policy({ publicId: 'p3' }),
    ];

    await evaluateOutputText(rules, ANSWER, deps, { policyCap: 2 });

    expect(judge).toHaveBeenCalledTimes(2);
    expect(onPolicyCapExceeded).toHaveBeenCalledWith(
      [expect.objectContaining({ publicId: 'p3' })],
      2,
    );
  });

  it('reports a pattern rule the budget skipped', async () => {
    await evaluateOutputText([rule()], ANSWER, deps, {
      budgetMs: 0,
      now: () => 1_000,
    });

    expect(onBudgetExhausted).toHaveBeenCalledWith(
      [expect.objectContaining({ publicId: 'rule-1' })],
      0,
    );
    expect(record).not.toHaveBeenCalled();
  });

  it('records a LOG rule that fired on the same answer as a blocking policy', async () => {
    // Recorded before the block returns, so the hit counts describe the rules
    // that fired rather than only the turns nobody blocked.
    judge.mockResolvedValue({ outcome: 'scored', score: 1 });

    await evaluateOutputText(
      [rule({ action: 'LOG' }), policy({ action: 'BLOCK' })],
      ANSWER,
      deps,
    );

    expect(record).toHaveBeenCalledWith({
      rule: expect.objectContaining({ publicId: 'policy-1' }),
      score: 1,
    });
  });
});
