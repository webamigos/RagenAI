import {
  AUTHORABLE_COMBINATIONS,
  type GuardrailCombination,
} from '@ragenai/guardrails';
import { describe, expect, it } from 'vitest';

import { offeredStagesByKind } from '../components/GuardrailForm';

const PATTERN_INPUT: GuardrailCombination[] = [
  { kind: 'PATTERN', stage: 'INPUT' },
];

describe('the stages the form offers', () => {
  it('offers only what the build can evaluate when nothing is being edited', () => {
    const offered = offeredStagesByKind(PATTERN_INPUT);

    expect([...offered.keys()]).toEqual(['PATTERN']);
    expect(offered.get('PATTERN')).toEqual(['INPUT']);
  });

  it('adds the edited rule’s own kind and stage, whatever the build evaluates', () => {
    // A built-in is seeded BUILT_IN/INPUT, which the supported set does not
    // list until Phase B. Without this the select renders with no option
    // matching the value it holds, which reads as an empty form rather than
    // as a fixed field.
    const offered = offeredStagesByKind(PATTERN_INPUT, {
      kind: 'BUILT_IN',
      stage: 'INPUT',
    });

    expect(offered.get('BUILT_IN')).toEqual(['INPUT']);
  });

  it('names each stage once when the edited rule and the build agree', () => {
    // The duplicate this guards: a BOTH pattern rule seeded INPUT, OUTPUT and
    // BOTH, then took INPUT from the supported set and BOTH from the
    // derivation below it — and the select rendered each of them twice.
    // Invisible to a behaviour test, because React renders two identical
    // options without complaint.
    const offered = offeredStagesByKind(PATTERN_INPUT, {
      kind: 'PATTERN',
      stage: 'BOTH',
    });
    const stages = offered.get('PATTERN') ?? [];

    expect(new Set(stages).size).toBe(stages.length);
    expect(stages).toEqual(['INPUT', 'OUTPUT', 'BOTH']);
  });

  it('offers BOTH only where both halves are supported', () => {
    // BOTH is shorthand for two stages, not a third one. Offering it on a
    // build that evaluates only the input half would be a rule enforced one
    // way and silently absent the other.
    const inputOnly = offeredStagesByKind(PATTERN_INPUT);
    const bothHalves = offeredStagesByKind([
      { kind: 'PATTERN', stage: 'INPUT' },
      { kind: 'PATTERN', stage: 'OUTPUT' },
    ]);

    expect(inputOnly.get('PATTERN')).not.toContain('BOTH');
    expect(bothHalves.get('PATTERN')).toContain('BOTH');
  });
});

/**
 * What the form actually offers, rather than what it does with a list.
 *
 * Every test above hands `offeredStagesByKind` a set of its own, which is how
 * the derivation should be tested — and leaves the real question unasked: is
 * the output stage on the menu at all? That is a property of
 * `AUTHORABLE_COMBINATIONS`, and D4 is the change that made it true.
 */
describe('the stages this build offers an operator', () => {
  const offered = offeredStagesByKind([...AUTHORABLE_COMBINATIONS]);

  it('offers a pattern rule on either stage, and on both', () => {
    expect(offered.get('PATTERN')).toEqual(['INPUT', 'OUTPUT', 'BOTH']);
  });

  it('offers a policy rule on either stage, and on both', () => {
    expect(offered.get('LLM_POLICY')).toEqual(['INPUT', 'OUTPUT', 'BOTH']);
  });

  it('offers no built-in, which is seeded rather than written', () => {
    // A `BUILT_IN` is identified by a key the code knows. One an operator
    // typed would have no key and no detector behind it — a rule that
    // resolves, is kept, matches nothing and reads as enabled.
    expect([...offered.keys()]).not.toContain('BUILT_IN');
  });
});
