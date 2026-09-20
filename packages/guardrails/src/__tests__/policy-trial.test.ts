import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_POLICY_THRESHOLD } from '../contracts/guardrail';
import type { JudgePolicy } from '../evaluator/policy';
import {
  POLICY_TRIAL_RULE_ID,
  runPolicyTrial,
} from '../evaluator/policy-trial';

const judgeScoring = (score: number): JudgePolicy =>
  vi.fn(() => Promise.resolve({ outcome: 'scored', score } as const));

const draft = {
  policy: 'Never discuss a competitor’s pricing.',
  threshold: null,
};

describe('runPolicyTrial', () => {
  it('reports a hit with the score and the threshold applied', async () => {
    const result = await runPolicyTrial(
      draft,
      'what does Acme charge?',
      judgeScoring(0.9),
    );

    expect(result).toEqual({
      outcome: 'scored',
      score: 0.9,
      threshold: DEFAULT_POLICY_THRESHOLD,
      matched: true,
    });
  });

  /**
   * The reason `runPolicyRules` gained `scored`. "It did not fire" is not
   * something an operator can tune against — 0.05 and 0.68 are the same
   * answer and completely different situations.
   */
  it('reports the score of a miss, not merely that it missed', async () => {
    const result = await runPolicyTrial(draft, 'hello', judgeScoring(0.68));

    expect(result).toEqual({
      outcome: 'scored',
      score: 0.68,
      threshold: DEFAULT_POLICY_THRESHOLD,
      matched: false,
    });
  });

  it('applies the draft threshold rather than the default', async () => {
    const result = await runPolicyTrial(
      { ...draft, threshold: 0.6 },
      'what does Acme charge?',
      judgeScoring(0.65),
    );

    expect(result).toEqual({
      outcome: 'scored',
      score: 0.65,
      threshold: 0.6,
      matched: true,
    });
  });

  /**
   * The same text and score decide differently either side of the threshold,
   * which is what the box is for. Asserted as a pair so a trial that ignored
   * the threshold entirely — always reporting `matched: true`, say — cannot
   * pass.
   */
  it('turns on the threshold and nothing else', async () => {
    const above = await runPolicyTrial(
      { ...draft, threshold: 0.5 },
      'x',
      judgeScoring(0.5),
    );
    const below = await runPolicyTrial(
      { ...draft, threshold: 0.51 },
      'x',
      judgeScoring(0.5),
    );

    expect(above).toMatchObject({ matched: true, score: 0.5 });
    expect(below).toMatchObject({ matched: false, score: 0.5 });
  });

  it('passes a judge error through rather than reading it as a zero', async () => {
    const judge: JudgePolicy = vi.fn(() =>
      Promise.resolve({ outcome: 'error', reason: 'timeout' } as const),
    );

    expect(await runPolicyTrial(draft, 'hello', judge)).toEqual({
      outcome: 'error',
      reason: 'timeout',
    });
  });

  it('survives a judge that rejects instead of returning an error', async () => {
    const judge: JudgePolicy = vi.fn(() => Promise.reject(new Error('boom')));

    expect(await runPolicyTrial(draft, 'hello', judge)).toMatchObject({
      outcome: 'error',
    });
  });

  it('asks the judge the policy question, with the draft prose in it', async () => {
    const judge = judgeScoring(0.1);
    await runPolicyTrial(draft, 'a message', judge);

    expect(judge).toHaveBeenCalledTimes(1);
    const request = vi.mocked(judge).mock.calls[0]![0];
    expect(request.prompt).toContain(draft.policy);
    expect(request.prompt).toContain('a message');
    // The trial must not be handed the jailbreak question. It shares the loop
    // with the built-in, and `judgeRequestFor` chooses by kind and key — a
    // trial rule built as a `BUILT_IN` would silently score against a prompt
    // the operator never wrote.
    expect(request.system).toContain('policy compliance classifier');
  });

  it('runs a rule that is marked as a trial and never blocks', async () => {
    const judge = judgeScoring(1);
    await runPolicyTrial(draft, 'a message', judge);

    const { rule } = vi.mocked(judge).mock.calls[0]![0];
    expect(rule.publicId).toBe(POLICY_TRIAL_RULE_ID);
    expect(rule.action).toBe('LOG');
    expect(rule.organizationId).toBeNull();
  });
});
