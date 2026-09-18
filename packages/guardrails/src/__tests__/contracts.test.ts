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
  it('is empty in this build, which ships no evaluator', () => {
    // Phase A deliberately ends with rules an operator can create and nothing
    // reading them. An entry here before an evaluator exists would let the
    // admin form offer an effect the build does not have.
    expect(SUPPORTED_COMBINATIONS).toEqual([]);
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
