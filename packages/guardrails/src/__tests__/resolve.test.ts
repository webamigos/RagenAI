import { describe, expect, it } from 'vitest';

import type {
  GuardrailCombination,
  GuardrailRule,
} from '../contracts/guardrail';
import {
  activeGuardrails,
  guardrailsForStage,
  inputStageMustBlock,
  resolveGuardrails,
} from '../resolver/resolve';

/** Everything a build would need to evaluate, so tests state their own gate. */
const EVERYTHING: readonly GuardrailCombination[] = [
  { kind: 'BUILT_IN', stage: 'INPUT' },
  { kind: 'BUILT_IN', stage: 'OUTPUT' },
  { kind: 'PATTERN', stage: 'INPUT' },
  { kind: 'PATTERN', stage: 'OUTPUT' },
  { kind: 'LLM_POLICY', stage: 'INPUT' },
  { kind: 'LLM_POLICY', stage: 'OUTPUT' },
];

function rule(overrides: Partial<GuardrailRule> = {}): GuardrailRule {
  return {
    publicId: 'rule-1',
    organizationId: null,
    key: null,
    name: 'A rule',
    kind: 'PATTERN',
    stage: 'INPUT',
    action: 'LOG',
    enabled: true,
    severity: 'warn',
    ...overrides,
  };
}

describe('the effective set', () => {
  it('unions platform rules with the organization’s own', () => {
    const result = resolveGuardrails({
      platformRules: [rule({ publicId: 'platform-1' })],
      orgRules: [rule({ publicId: 'org-1', organizationId: 'org-a' })],
      supportedCombinations: EVERYTHING,
    });

    expect(result.rules.map((r) => r.publicId)).toEqual([
      'platform-1',
      'org-1',
    ]);
    expect(result.rules[0].isPlatformRule).toBe(true);
    expect(result.rules[1].isPlatformRule).toBe(false);
  });

  it('ignores a rule belonging to another organization passed as a platform rule', () => {
    // The caller's query is supposed to filter this; the resolver does not
    // trust it, because the cost of being wrong is one tenant's rule applied
    // to another.
    const result = resolveGuardrails({
      platformRules: [
        rule({ publicId: 'not-platform', organizationId: 'org-b' }),
      ],
      supportedCombinations: EVERYTHING,
    });

    expect(result.rules).toEqual([]);
  });

  it('reports every value as coming from the org’s own rule', () => {
    const result = resolveGuardrails({
      platformRules: [],
      orgRules: [rule({ publicId: 'org-1', organizationId: 'org-a' })],
      supportedCombinations: EVERYTHING,
    });

    expect(result.rules[0].sources).toEqual({
      enabled: 'org-rule',
      action: 'org-rule',
      threshold: 'org-rule',
    });
  });
});

describe('overrides', () => {
  it('turns a platform rule off and says where that came from', () => {
    const result = resolveGuardrails({
      platformRules: [rule({ publicId: 'p1', enabled: true })],
      overrides: [
        { guardrailPublicId: 'p1', organizationId: 'org-a', enabled: false },
      ],
      supportedCombinations: EVERYTHING,
    });

    expect(result.rules[0].enabled).toBe(false);
    expect(result.rules[0].sources.enabled).toBe('org-override');
    expect(result.rules[0].sources.action).toBe('platform-rule');
  });

  it('treats null as inherit rather than as off', () => {
    // The distinction the tri-state exists for: "off" and "not decided here"
    // are different answers, and collapsing them would make an override row
    // that touches only the threshold silently disable the rule.
    const result = resolveGuardrails({
      platformRules: [rule({ publicId: 'p1', enabled: true })],
      overrides: [
        { guardrailPublicId: 'p1', organizationId: 'org-a', enabled: null },
      ],
      supportedCombinations: EVERYTHING,
    });

    expect(result.rules[0].enabled).toBe(true);
    expect(result.rules[0].sources.enabled).toBe('platform-rule');
  });

  it('drops an override that points at another organization’s rule', () => {
    const result = resolveGuardrails({
      platformRules: [rule({ publicId: 'p1' })],
      orgRules: [rule({ publicId: 'org-1', organizationId: 'org-a' })],
      overrides: [
        { guardrailPublicId: 'org-1', organizationId: 'org-a', enabled: false },
      ],
      supportedCombinations: EVERYTHING,
    });

    expect(result.dropped).toContainEqual({
      reason: 'override-targets-non-platform-rule',
      guardrailPublicId: 'org-1',
    });
    expect(result.rules.find((r) => r.publicId === 'org-1')?.enabled).toBe(
      true,
    );
  });

  it('drops an override whose rule no longer exists', () => {
    const result = resolveGuardrails({
      platformRules: [rule({ publicId: 'p1' })],
      overrides: [
        { guardrailPublicId: 'gone', organizationId: 'org-a', enabled: false },
      ],
      supportedCombinations: EVERYTHING,
    });

    expect(result.dropped).toEqual([
      { reason: 'override-for-unknown-rule', guardrailPublicId: 'gone' },
    ]);
  });

  it('refuses an action the kind cannot carry out, keeping the rule’s own', () => {
    // MASK on a built-in has no span to replace. Falling back to the rule's
    // action rather than dropping the rule is deliberate: a bad override
    // should not turn into no protection.
    const result = resolveGuardrails({
      platformRules: [
        // A real built-in key, because support for a built-in is per key: one
        // with no key, or a key this build has no evaluator for, is dropped
        // before any override is considered. This test is about the override,
        // so the rule under it has to be one that can exist.
        rule({
          publicId: 'p1',
          kind: 'BUILT_IN',
          key: 'content-moderation',
          action: 'BLOCK',
        }),
      ],
      overrides: [
        { guardrailPublicId: 'p1', organizationId: 'org-a', action: 'MASK' },
      ],
      supportedCombinations: EVERYTHING,
    });

    expect(result.rules[0].action).toBe('BLOCK');
    expect(result.rules[0].sources.action).toBe('platform-rule');
    expect(result.dropped).toContainEqual({
      reason: 'override-action-invalid-for-kind',
      guardrailPublicId: 'p1',
    });
  });

  it.each([-0.1, 1.1, Number.NaN, Number.POSITIVE_INFINITY])(
    'refuses a threshold outside 0–1 (%s)',
    (threshold) => {
      const result = resolveGuardrails({
        platformRules: [
          rule({ publicId: 'p1', kind: 'LLM_POLICY', threshold: 0.8 }),
        ],
        overrides: [
          { guardrailPublicId: 'p1', organizationId: 'org-a', threshold },
        ],
        supportedCombinations: EVERYTHING,
      });

      expect(result.rules[0].threshold).toBe(0.8);
      expect(result.dropped).toContainEqual({
        reason: 'override-threshold-out-of-range',
        guardrailPublicId: 'p1',
      });
    },
  );

  it.each([0, 0.5, 1])(
    'accepts a threshold at the bounds (%s)',
    (threshold) => {
      const result = resolveGuardrails({
        platformRules: [
          rule({ publicId: 'p1', kind: 'LLM_POLICY', threshold: 0.8 }),
        ],
        overrides: [
          { guardrailPublicId: 'p1', organizationId: 'org-a', threshold },
        ],
        supportedCombinations: EVERYTHING,
      });

      expect(result.rules[0].threshold).toBe(threshold);
      expect(result.rules[0].sources.threshold).toBe('org-override');
    },
  );
});

describe('the legacy on-premise gate', () => {
  const input = {
    platformRules: [
      rule({ publicId: 'p1', key: 'content-moderation', enabled: true }),
    ],
    overrides: [
      {
        guardrailPublicId: 'p1',
        organizationId: 'org-a',
        enabled: false,
        origin: 'legacy_on_premise' as const,
      },
    ],
    supportedCombinations: EVERYTHING,
  };

  it('applies a seeded override on-premise, where the column was read', () => {
    const result = resolveGuardrails({ ...input, isOnPremise: true });

    expect(result.rules[0].enabled).toBe(false);
    expect(result.rules[0].sources.enabled).toBe('org-override');
  });

  it('skips it in SaaS, where the column is ignored today', () => {
    // The whole point: a SaaS organization sitting on `false` is moderated
    // today and expects to be. Honouring the seeded override here would turn
    // moderation off for exactly those tenants — the silent downgrade the
    // migration must not perform.
    const result = resolveGuardrails({ ...input, isOnPremise: false });

    expect(result.rules[0].enabled).toBe(true);
    expect(result.dropped).toContainEqual({
      reason: 'override-is-legacy-on-premise',
      guardrailPublicId: 'p1',
    });
  });

  it('defaults to skipping it when the caller does not say', () => {
    const result = resolveGuardrails(input);

    expect(result.rules[0].enabled).toBe(true);
  });

  it('leaves an operator’s own override alone in SaaS', () => {
    const result = resolveGuardrails({
      platformRules: [rule({ publicId: 'p1', enabled: true })],
      overrides: [
        { guardrailPublicId: 'p1', organizationId: 'org-a', enabled: false },
      ],
      supportedCombinations: EVERYTHING,
      isOnPremise: false,
    });

    expect(result.rules[0].enabled).toBe(false);
  });
});

describe('unsupported combinations', () => {
  it('drops a rule this build cannot evaluate, from either layer', () => {
    const result = resolveGuardrails({
      platformRules: [rule({ publicId: 'p1', kind: 'LLM_POLICY' })],
      orgRules: [
        rule({ publicId: 'o1', organizationId: 'org-a', stage: 'OUTPUT' }),
      ],
      supportedCombinations: [{ kind: 'PATTERN', stage: 'INPUT' }],
    });

    expect(result.rules).toEqual([]);
    expect(result.dropped).toEqual([
      { reason: 'unsupported-combination', guardrailPublicId: 'p1' },
      { reason: 'unsupported-combination', guardrailPublicId: 'o1' },
    ]);
  });

  it('uses the package default when the caller states no set', () => {
    // The default is what the package can evaluate: PATTERN at INPUT, and
    // nothing else. A kind whose evaluator does not exist anywhere is dropped
    // rather than resolved to a rule that would be enforced by nothing.
    const result = resolveGuardrails({
      platformRules: [
        rule({ publicId: 'pattern-input' }),
        rule({ publicId: 'judge', kind: 'LLM_POLICY' }),
        rule({ publicId: 'on-output', stage: 'OUTPUT' }),
      ],
    });

    expect(result.rules.map((r) => r.publicId)).toEqual(['pattern-input']);
    expect(result.dropped.map((d) => d.guardrailPublicId).sort()).toEqual([
      'judge',
      'on-output',
    ]);
  });
});

describe('reading the resolved set', () => {
  it('returns only enabled rules as active', () => {
    const result = resolveGuardrails({
      platformRules: [
        rule({ publicId: 'on', enabled: true }),
        rule({ publicId: 'off', enabled: false }),
      ],
      supportedCombinations: EVERYTHING,
    });

    expect(activeGuardrails(result).map((r) => r.publicId)).toEqual(['on']);
  });

  it('counts a BOTH rule for each stage', () => {
    const result = resolveGuardrails({
      platformRules: [rule({ publicId: 'both', stage: 'BOTH' })],
      supportedCombinations: EVERYTHING,
    });

    expect(guardrailsForStage(result, 'INPUT')).toHaveLength(1);
    expect(guardrailsForStage(result, 'OUTPUT')).toHaveLength(1);
  });

  it('makes the input stage block when a mask rule is active, and not otherwise', () => {
    // The property the chain reads once per turn: with no masking rule the
    // input evaluation stays concurrent with rephraseAndExpand, as moderation
    // is today. One mask rule makes it blocking, because a rewrite has to land
    // before the rephrase reads the text.
    const withMask = resolveGuardrails({
      platformRules: [rule({ publicId: 'm', action: 'MASK' })],
      supportedCombinations: EVERYTHING,
    });
    const withoutMask = resolveGuardrails({
      platformRules: [rule({ publicId: 'b', action: 'BLOCK' })],
      supportedCombinations: EVERYTHING,
    });

    expect(inputStageMustBlock(withMask)).toBe(true);
    expect(inputStageMustBlock(withoutMask)).toBe(false);
  });

  it('does not block on a mask rule that is switched off', () => {
    const result = resolveGuardrails({
      platformRules: [rule({ publicId: 'm', action: 'MASK', enabled: false })],
      supportedCombinations: EVERYTHING,
    });

    expect(inputStageMustBlock(result)).toBe(false);
  });

  it('does not block on an output-only mask rule', () => {
    const result = resolveGuardrails({
      platformRules: [rule({ publicId: 'm', action: 'MASK', stage: 'OUTPUT' })],
      supportedCombinations: EVERYTHING,
    });

    expect(inputStageMustBlock(result)).toBe(false);
  });
});
