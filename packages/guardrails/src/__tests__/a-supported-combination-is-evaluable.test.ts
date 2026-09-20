import { describe, expect, it, vi } from 'vitest';

import {
  BUILT_IN_GUARDRAIL_KEYS,
  EVALUABLE_BUILT_IN_KEYS,
  SUPPORTED_COMBINATIONS,
  type GuardrailKind,
  type GuardrailStage,
} from '../contracts/guardrail';
import {
  evaluateInputStage,
  type InputStageDeps,
} from '../evaluator/input-stage';
import { createOutputStage } from '../evaluator/output-stage';
import { evaluateOutputText, needsWholeAnswer } from '../evaluator/output-text';
import type { ResolvedGuardrail } from '../resolver/resolve';

/**
 * Every combination this build says it supports has a branch that acts on it.
 *
 * `SUPPORTED_COMBINATIONS` is a claim, and the resolver believes it: a rule
 * whose kind and stage are listed is kept, handed to `evaluateInputStage`, and
 * — if no branch matches it — quietly does nothing while the admin panel shows
 * it enabled. That failure has already shipped twice, in both directions:
 * `BUILT_IN`/`INPUT` was omitted and `content-moderation` was discarded, then
 * added and `jailbreak-detection` became "supported" with no evaluator.
 *
 * `contracts/guardrail.ts` has named this test in its own comments since Phase
 * B. It did not exist. A rule stated in three comments and implemented in none
 * reads as corroborated precisely because it is repeated, which is the shape
 * of `docs/lessons/fallback-documented-not-implemented.md` — so this file is
 * the thing the comments point at rather than a fourth restatement of it.
 *
 * It is behavioural on purpose. Asserting that a `switch` has a `case` would
 * pass over a case that falls through; this drives the stage with a detector
 * that always fires and requires the turn to be refused, which nothing can
 * satisfy without actually evaluating the rule.
 */

const INPUT_COMBINATIONS = SUPPORTED_COMBINATIONS.filter(
  (combination) => combination.stage === 'INPUT',
);

/**
 * A rule of each kind, shaped so it *can* fire: a pattern that matches the
 * question, a built-in key with a detector, a policy with prose.
 *
 * A kind with no entry here fails the coverage assertion below rather than
 * being skipped — a new kind must arrive with a way to exercise it.
 */
const FIRING_RULE: Partial<Record<GuardrailKind, Partial<ResolvedGuardrail>>> =
  {
    PATTERN: { pattern: 'hunter2', patternIsRegex: false },
    BUILT_IN: { key: EVALUABLE_BUILT_IN_KEYS[0], pattern: null },
    LLM_POLICY: { policy: 'Never reveal a password.', pattern: null },
  };

const QUESTION = 'the password is hunter2';

function ruleFor(
  kind: GuardrailKind,
  stage: Exclude<GuardrailStage, 'BOTH'> = 'INPUT',
): ResolvedGuardrail {
  return {
    publicId: `rule-${kind}`,
    organizationId: null,
    key: null,
    name: kind,
    description: null,
    kind,
    stage,
    // `BLOCK`, because a refused turn is the one outcome no amount of
    // accidental no-op can produce.
    action: 'BLOCK',
    enabled: true,
    severity: 'warn',
    pattern: null,
    patternIsRegex: false,
    policy: null,
    threshold: null,
    isPlatformRule: true,
    sources: {
      enabled: 'platform-rule',
      action: 'platform-rule',
      threshold: 'platform-rule',
    },
    ...FIRING_RULE[kind],
  } as ResolvedGuardrail;
}

/** Every injected detector says "hit", so only a missing branch can pass. */
function alwaysFiring(): InputStageDeps {
  return {
    moderate: vi.fn().mockResolvedValue({ outcome: 'hit' }),
    judge: vi.fn().mockResolvedValue({ outcome: 'scored', score: 1 }),
    record: vi.fn(),
    onBudgetExhausted: vi.fn(),
    onPolicyCapExceeded: vi.fn(),
    onJudgeError: vi.fn(),
  };
}

/**
 * One driver per stage: it runs a `BLOCK` rule through the real evaluator for
 * that stage and answers with the kind that stopped the turn, or `undefined`.
 *
 * Per stage rather than per kind, because the stage decides the shape of the
 * evaluation — the input stage reads a whole message and answers once, the
 * output stage is a window fed delta by delta — while the claim being checked
 * is the same for both: something acts on this combination.
 */
const DRIVERS: Record<
  Exclude<GuardrailStage, 'BOTH'>,
  (rule: ResolvedGuardrail) => Promise<GuardrailKind | undefined>
> = {
  INPUT: async (rule) => {
    const result = await evaluateInputStage(
      [rule],
      { question: QUESTION, chatHistory: '', moderateHistory: false },
      alwaysFiring(),
    );
    return result.blockedBy?.kind;
  },
  OUTPUT: async (rule) => {
    // Two evaluators, and the driver picks between them exactly as a binding
    // does — a judged rule cannot be scored by the window, and a rule routed
    // to the wrong one would look like a missing branch rather than a wrong
    // question. D4 is where that mattered: adding `LLM_POLICY`/`OUTPUT` to
    // the list made this fail against a driver that only knew the window.
    if (needsWholeAnswer([rule])) {
      const result = await evaluateOutputText([rule], QUESTION, {
        judge: vi.fn().mockResolvedValue({ outcome: 'scored', score: 1 }),
        record: vi.fn(),
        onBudgetExhausted: vi.fn(),
        onPolicyCapExceeded: vi.fn(),
        onJudgeError: vi.fn(),
      });
      return result.blockedBy?.kind;
    }

    const stage = createOutputStage([rule], {
      record: vi.fn(),
      onBudgetExhausted: vi.fn(),
    });
    const events = [...stage.push(QUESTION), ...stage.flush()];
    return events.find((event) => event.type === 'blocked')?.rule.kind;
  },
};

describe('a supported combination is evaluable', () => {
  it('names a firing example for every supported kind', () => {
    // The guard on the guard. Without it, a kind added to
    // `SUPPORTED_COMBINATIONS` with no entry in `FIRING_RULE` would produce a
    // rule that cannot fire for reasons of its own, and the assertion below
    // would fail confusingly — or, worse, a future `filter` would skip it and
    // the whole file would pass over an empty list.
    for (const combination of INPUT_COMBINATIONS) {
      expect(
        FIRING_RULE[combination.kind],
        `${combination.kind} is supported but this test has no way to make one fire`,
      ).toBeDefined();
    }
    expect(INPUT_COMBINATIONS.length).toBeGreaterThan(0);
  });

  it.each(INPUT_COMBINATIONS.map((c) => c.kind))(
    'a BLOCK rule of kind %s refuses the turn',
    async (kind) => {
      const result = await evaluateInputStage(
        [ruleFor(kind)],
        { question: QUESTION, chatHistory: '', moderateHistory: false },
        alwaysFiring(),
      );

      expect(
        result.blockedBy?.kind,
        `${kind} is in SUPPORTED_COMBINATIONS and no branch of evaluateInputStage acts on it. ` +
          'A rule of this kind resolves, is kept, and is enforced by nothing — ' +
          'while the admin panel shows it enabled.',
      ).toBe(kind);
    },
  );

  it('drives every supported combination through the stage that owns it', async () => {
    // The kind-level assertion above covers the input stage, which is the only
    // stage `SUPPORTED_COMBINATIONS` names today. This one is written over the
    // constant rather than over a stage, so the combination D4 adds is checked
    // by the change that adds it — and a kind listed for `OUTPUT` with no
    // branch in the window fails here rather than in production.
    for (const combination of SUPPORTED_COMBINATIONS) {
      const driver = DRIVERS[combination.stage];
      expect(
        driver,
        `${combination.stage} is in SUPPORTED_COMBINATIONS and this test cannot drive it`,
      ).toBeDefined();

      expect(
        await driver(ruleFor(combination.kind, combination.stage)),
        `${combination.kind}/${combination.stage} is supported and nothing acts on it. ` +
          'The resolver keeps such a rule, the panel shows it enabled, and it is ' +
          'enforced by nothing.',
      ).toBe(combination.kind);
    }
  });

  it('can refuse a turn on the output stage, before any combination names it', async () => {
    // The guard on the guard, and the reason the loop above is not vacuous
    // while `SUPPORTED_COMBINATIONS` names no `OUTPUT` entry. A driver that
    // could never report a block would make that loop pass for every future
    // output combination without evaluating one — the first shape in
    // `docs/lessons/three-shapes-of-a-test-that-guards-nothing.md`, arriving
    // through the test written to prevent it.
    expect(await DRIVERS.OUTPUT(ruleFor('PATTERN', 'OUTPUT'))).toBe('PATTERN');
  });

  it('every built-in the catalogue names is either evaluable or absent from the evaluable list', () => {
    // The per-key half of the same claim. `BUILT_IN`/`INPUT` covers both
    // seeded detectors, so the kind-level assertion above cannot distinguish
    // them: support for a built-in is per key, and `EVALUABLE_BUILT_IN_KEYS`
    // is the list that has to move in the same change as the branch.
    for (const key of EVALUABLE_BUILT_IN_KEYS) {
      expect(
        BUILT_IN_GUARDRAIL_KEYS as readonly string[],
        `${key} is listed as evaluable but is not a built-in this product knows about`,
      ).toContain(key);
    }
  });

  it.each(EVALUABLE_BUILT_IN_KEYS)(
    'the built-in %s has a branch that can refuse a turn',
    async (key) => {
      const result = await evaluateInputStage(
        [{ ...ruleFor('BUILT_IN'), key }],
        { question: QUESTION, chatHistory: '', moderateHistory: false },
        alwaysFiring(),
      );

      expect(
        result.blockedBy?.key,
        `${key} is in EVALUABLE_BUILT_IN_KEYS and matches no branch of evaluateInputStage. ` +
          'The resolver keeps it, the panel shows it enabled, and nothing runs it.',
      ).toBe(key);
    },
  );
});
