import { describe, expect, it, vi } from 'vitest';

import type { GuardrailRule } from '../contracts/guardrail';
import {
  DEFAULT_POLICY_THRESHOLD,
  MAX_ACTIVE_LLM_POLICIES,
  hasEvaluablePolicy,
  policyThresholdFor,
  runPolicyRules,
  type JudgePolicy,
} from '../evaluator/policy';

const policy = (over: Partial<GuardrailRule> = {}): GuardrailRule => ({
  publicId: 'policy-1',
  organizationId: null,
  key: null,
  name: 'No competitor pricing',
  description: null,
  kind: 'LLM_POLICY',
  stage: 'INPUT',
  action: 'LOG',
  enabled: true,
  severity: 'warn',
  pattern: null,
  patternIsRegex: false,
  policy: 'Never discuss a competitor’s pricing.',
  threshold: null,
  ...over,
});

/** A judge that answers from a table of scores, keyed by rule. */
const scoring = (scores: Record<string, number>): JudgePolicy =>
  vi.fn(({ rule }) =>
    Promise.resolve(
      rule.publicId in scores
        ? ({ outcome: 'scored', score: scores[rule.publicId] } as const)
        : ({ outcome: 'error', reason: 'no score for this rule' } as const),
    ),
  );

describe('policyThresholdFor', () => {
  it('falls back to the classifier’s own default', () => {
    // 0.7, inherited from `jailbreak-classifier.ts` rather than chosen afresh,
    // so a built-in absorbed into this loop keeps the sensitivity it shipped
    // with instead of acquiring a new one in the change that moves it.
    expect(policyThresholdFor(policy({ threshold: null }))).toBe(
      DEFAULT_POLICY_THRESHOLD,
    );
    expect(policyThresholdFor(policy({ threshold: undefined }))).toBe(0.7);
  });

  it('uses the rule’s own threshold when it has one', () => {
    expect(policyThresholdFor(policy({ threshold: 0.4 }))).toBe(0.4);
    expect(policyThresholdFor(policy({ threshold: 0 }))).toBe(0);
  });

  it('clamps a row the resolver would have refused', () => {
    // The resolver rejects an out-of-range override, but a `Guardrail` row can
    // carry one directly — it is a plain `Float?` column. Comparing a score
    // against NaN is false for every score, so the rule would read as enabled
    // and never fire.
    expect(policyThresholdFor(policy({ threshold: 5 }))).toBe(1);
    expect(policyThresholdFor(policy({ threshold: -2 }))).toBe(0);
    expect(policyThresholdFor(policy({ threshold: Number.NaN }))).toBe(0.7);
  });
});

describe('hasEvaluablePolicy', () => {
  it.each([null, undefined, '', '   '])(
    'refuses a rule whose policy is %j',
    (value) => {
      expect(hasEvaluablePolicy(policy({ policy: value }))).toBe(false);
    },
  );

  it('accepts one with prose', () => {
    expect(hasEvaluablePolicy(policy())).toBe(true);
  });
});

describe('runPolicyRules', () => {
  it('hits at the threshold, not above it', async () => {
    // `>=`, matching `isAboveJailbreakThreshold`, which the docs and the
    // security-monitoring threshold table both describe as "0.7 or above".
    const run = await runPolicyRules(
      [policy({ threshold: 0.7 })],
      'hello',
      scoring({ 'policy-1': 0.7 }),
    );

    expect(run.hits).toEqual([{ rule: expect.anything(), score: 0.7 }]);
  });

  it('does not hit below it', async () => {
    const run = await runPolicyRules(
      [policy({ threshold: 0.7 })],
      'hello',
      scoring({ 'policy-1': 0.69 }),
    );

    expect(run.hits).toEqual([]);
    expect(run.errors).toEqual([]);
  });

  it('reports a judge that could not answer, and does not call it a hit', async () => {
    // A timed-out judge and a judge that read the message and found nothing
    // are the same value and different events. Scoring an error as zero is how
    // "the policy is working" and "the policy has not run since Tuesday"
    // become indistinguishable.
    const run = await runPolicyRules([policy()], 'hello', () =>
      Promise.resolve({ outcome: 'error', reason: 'timeout' }),
    );

    expect(run.hits).toEqual([]);
    expect(run.errors).toEqual([
      { rule: expect.anything(), reason: 'timeout' },
    ]);
  });

  it('survives a judge that rejects instead of returning an error', async () => {
    // A binding is supposed to return `{ outcome: 'error' }`. One of them
    // eventually will not, and an unhandled rejection inside `Promise.all`
    // takes every other policy on the turn down with it — one misbehaving rule
    // silently disabling the rest.
    const run = await runPolicyRules(
      [policy({ publicId: 'a' }), policy({ publicId: 'b' })],
      'hello',
      ({ rule }) =>
        rule.publicId === 'a'
          ? Promise.reject(new Error('provider exploded'))
          : Promise.resolve({ outcome: 'scored', score: 0.9 }),
    );

    expect(run.errors.map((e) => e.rule.publicId)).toEqual(['a']);
    expect(run.hits.map((h) => h.rule.publicId)).toEqual(['b']);
  });

  it('skips a rule with no policy rather than judging it against nothing', async () => {
    const judge = vi.fn();
    const run = await runPolicyRules(
      [policy({ policy: '   ' })],
      'hello',
      judge as unknown as JudgePolicy,
    );

    expect(judge).not.toHaveBeenCalled();
    expect(run.hits).toEqual([]);
  });

  it('runs the rules concurrently', async () => {
    // Sequentially, three rules at the 3 s timeout would be a nine-second wait
    // before the model is asked the question at all. Asserted by observing
    // that all three judges are in flight at once, which is the property —
    // timing the whole call would assert the machine's speed.
    let inFlight = 0;
    let peak = 0;
    const judge: JudgePolicy = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight -= 1;
      return { outcome: 'scored', score: 0 };
    };

    await runPolicyRules(
      ['a', 'b', 'c'].map((publicId) => policy({ publicId })),
      'hello',
      judge,
    );

    expect(peak).toBe(3);
  });

  it('runs no more than the cap, and says which it left out', async () => {
    // Concurrency bounds the latency; nothing bounds the spend, and spend is
    // the sum. A fourth policy rule is a fourth model call per turn, for ever,
    // with nothing on screen saying so.
    const judge = vi.fn(() =>
      Promise.resolve({ outcome: 'scored', score: 0 } as const),
    );
    const rules = ['a', 'b', 'c', 'd'].map((publicId) => policy({ publicId }));

    const run = await runPolicyRules(rules, 'hello', judge, { cap: 3 });

    expect(judge).toHaveBeenCalledTimes(3);
    expect(run.skipped.map((r) => r.publicId)).toEqual(['d']);
  });

  it('defaults the cap to MAX_ACTIVE_LLM_POLICIES', async () => {
    const judge = vi.fn(() =>
      Promise.resolve({ outcome: 'scored', score: 0 } as const),
    );
    const rules = Array.from({ length: MAX_ACTIVE_LLM_POLICIES + 1 }, (_, i) =>
      policy({ publicId: `p${i}` }),
    );

    const run = await runPolicyRules(rules, 'hello', judge);

    expect(judge).toHaveBeenCalledTimes(MAX_ACTIVE_LLM_POLICIES);
    expect(run.skipped).toHaveLength(1);
  });

  it('returns hits in rule order, not in the order the judges answered', async () => {
    // Which rule blocks a turn must not depend on which provider replied
    // first: an operator reading the incidents page would see a different
    // rule named on two identical messages.
    const judge: JudgePolicy = ({ rule }) =>
      new Promise((resolve) =>
        setTimeout(
          () => resolve({ outcome: 'scored', score: 0.9 }),
          rule.publicId === 'a' ? 20 : 0,
        ),
      );

    const run = await runPolicyRules(
      [policy({ publicId: 'a' }), policy({ publicId: 'b' })],
      'hello',
      judge,
    );

    expect(run.hits.map((h) => h.rule.publicId)).toEqual(['a', 'b']);
  });

  it('gives the judge the rule, because the prose is the prompt', async () => {
    // A judge handed only the text would have to be given the policy some
    // other way, and then two runtimes could give it differently.
    const judge = vi.fn(() =>
      Promise.resolve({ outcome: 'scored', score: 0 } as const),
    );

    await runPolicyRules([policy()], 'a message', judge);

    expect(judge).toHaveBeenCalledWith({
      rule: expect.objectContaining({
        policy: 'Never discuss a competitor’s pricing.',
      }),
      text: 'a message',
    });
  });
});
