import { describe, expect, it, vi } from 'vitest';

import {
  BUILT_IN_GUARDRAIL_KEYS,
  EVALUABLE_BUILT_IN_KEYS,
  SUPPORTED_COMBINATIONS,
  type GuardrailKind,
} from '../contracts/guardrail';
import {
  evaluateInputStage,
  type InputStageDeps,
} from '../evaluator/input-stage';
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

function ruleFor(kind: GuardrailKind): ResolvedGuardrail {
  return {
    publicId: `rule-${kind}`,
    organizationId: null,
    key: null,
    name: kind,
    description: null,
    kind,
    stage: 'INPUT',
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
