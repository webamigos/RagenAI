import { describe, expect, it } from 'vitest';

import {
  ACTIONS_BY_KIND,
  BUILT_IN_GUARDRAIL_DESCRIPTIONS,
  BUILT_IN_GUARDRAIL_KEYS,
  BUILT_IN_GUARDRAIL_LABELS,
  GUARDRAIL_ACTIONS,
  GUARDRAIL_KINDS,
  GUARDRAIL_STAGES,
  isActionValidForKind,
  isBuiltInGuardrailKey,
  isCombinationSupported,
  SUPPORTED_COMBINATIONS,
} from '../contracts/guardrail';

describe('the vocabulary', () => {
  it('matches the Prisma enums by name', () => {
    // If one of these changes, the migration and this package have to change
    // together. The names are the contract — a row written as `LLM_POLICY`
    // and read as `LLMPolicy` is a rule that silently never resolves.
    expect(GUARDRAIL_KINDS).toEqual(['BUILT_IN', 'PATTERN', 'LLM_POLICY']);
    expect(GUARDRAIL_STAGES).toEqual(['INPUT', 'OUTPUT', 'BOTH']);
    expect(GUARDRAIL_ACTIONS).toEqual(['BLOCK', 'MASK', 'LOG']);
  });

  it('gives every built-in a label and a description', () => {
    for (const key of BUILT_IN_GUARDRAIL_KEYS) {
      expect(BUILT_IN_GUARDRAIL_LABELS[key]).toBeTruthy();
      expect(BUILT_IN_GUARDRAIL_DESCRIPTIONS[key]).toBeTruthy();
    }
  });

  it('recognises a built-in key and rejects anything else', () => {
    expect(isBuiltInGuardrailKey('content-moderation')).toBe(true);
    expect(isBuiltInGuardrailKey('jailbreak-detection')).toBe(true);
    expect(isBuiltInGuardrailKey('content_moderation')).toBe(false);
    expect(isBuiltInGuardrailKey('')).toBe(false);
  });
});

describe('which actions a kind can carry out', () => {
  it('allows MASK for PATTERN only', () => {
    // A built-in and a judge both return a verdict over the whole text and no
    // span, so a masking rule on either has nothing to cut out.
    expect(isActionValidForKind('PATTERN', 'MASK')).toBe(true);
    expect(isActionValidForKind('BUILT_IN', 'MASK')).toBe(false);
    expect(isActionValidForKind('LLM_POLICY', 'MASK')).toBe(false);
  });

  it('allows BLOCK and LOG for every kind', () => {
    for (const kind of GUARDRAIL_KINDS) {
      expect(isActionValidForKind(kind, 'BLOCK')).toBe(true);
      expect(isActionValidForKind(kind, 'LOG')).toBe(true);
    }
  });

  it('covers every kind, so a new one cannot arrive undeclared', () => {
    for (const kind of GUARDRAIL_KINDS) {
      expect(ACTIONS_BY_KIND[kind].length).toBeGreaterThan(0);
    }
  });
});

describe('supported combinations', () => {
  it('reports what the package evaluates, and nothing beyond it', () => {
    // `PATTERN`/`INPUT` is `evaluator/pattern.ts`; `BUILT_IN`/`INPUT` is the
    // moderation branch of `evaluator/input-stage.ts`, which arrived in Phase
    // B. OUTPUT is absent for both because evaluating a whole string is not
    // the same problem as evaluating a stream — that needs Phase D's sliding
    // window.
    expect(SUPPORTED_COMBINATIONS).toEqual([
      { kind: 'PATTERN', stage: 'INPUT' },
      { kind: 'BUILT_IN', stage: 'INPUT' },
      { kind: 'LLM_POLICY', stage: 'INPUT' },
    ]);
  });

  it('offers no kind whose evaluator does not exist at all', () => {
    const kinds = new Set(SUPPORTED_COMBINATIONS.map((c) => c.kind));

    // `LLM_POLICY` is here as of Phase C, and this assertion used to say the
    // opposite — for the same reason the `BUILT_IN` one below it did, and with
    // the same expiry date. Both are snapshots of a capability, which is a
    // shape that keeps passing after the capability changes; the thing that
    // makes them worth keeping is that each one has to be edited by the change
    // that adds the evaluator, in the same commit.
    expect(kinds.has('LLM_POLICY')).toBe(true);

    // `BUILT_IN` is here, and this assertion used to say the opposite.
    //
    // It was right in Phase A, when no evaluator for it existed, and it went
    // stale the moment Phase B added one — locking in a real bug: the two
    // seeded detectors are `BUILT_IN`/`INPUT`, so the runtime resolver
    // discarded `content-moderation` as unsupported while the panel showed it
    // enabled. A test that asserts a snapshot of a capability keeps passing
    // after the capability changes, which is the whole reason this comment is
    // longer than the line below it.
    expect(kinds.has('BUILT_IN')).toBe(true);
  });

  it('answers per stage against an injected set', () => {
    const supported = [{ kind: 'PATTERN', stage: 'INPUT' }] as const;

    expect(isCombinationSupported('PATTERN', 'INPUT', supported)).toBe(true);
    expect(isCombinationSupported('PATTERN', 'OUTPUT', supported)).toBe(false);
    expect(isCombinationSupported('BUILT_IN', 'INPUT', supported)).toBe(false);
  });

  it('treats BOTH as needing both halves, not as a third stage', () => {
    const inputOnly = [{ kind: 'PATTERN', stage: 'INPUT' }] as const;
    const bothHalves = [
      { kind: 'PATTERN', stage: 'INPUT' },
      { kind: 'PATTERN', stage: 'OUTPUT' },
    ] as const;

    // This is the case that would otherwise let a BOTH rule through on a build
    // that can only evaluate its input half — enforced on the way in, silently
    // absent on the way out, which reads to an operator as a rule that works.
    expect(isCombinationSupported('PATTERN', 'BOTH', inputOnly)).toBe(false);
    expect(isCombinationSupported('PATTERN', 'BOTH', bothHalves)).toBe(true);
  });
});
