import { describe, expect, it } from 'vitest';

import {
  DEMO_FEATURE_OVERRIDES,
  DEMO_MONTHLY_COST_LIMIT_CENTS,
  DEMO_ORGANIZATION_RESTRICTIONS,
} from '../demo/demo-organization';
import {
  FEATURE_KEYS,
  resolveFeatures,
  sanitizeFeatureOverrides,
} from '../features/features';

/**
 * These constants fail silently when wrong: `featureOverrides` is an untyped
 * JSON column and `sanitizeFeatureOverrides` drops any key it does not
 * recognise, so a misspelled key writes a row that looks right and leaves the
 * demo tenant writable. `as const satisfies FeatureOverrides` is the first
 * line; this checks what the resolver actually does with the values.
 */
describe('the demo organization restrictions', () => {
  it('names only keys the resolver recognises', () => {
    for (const key of Object.keys(DEMO_FEATURE_OVERRIDES)) {
      expect(
        (FEATURE_KEYS as readonly string[]).includes(key),
        `"${key}" is not a FEATURE_KEY, so sanitizeFeatureOverrides drops it and the demo organization keeps that capability.`,
      ).toBe(true);
    }
  });

  it('survives sanitisation with every key intact', () => {
    expect(sanitizeFeatureOverrides({ ...DEMO_FEATURE_OVERRIDES })).toEqual(
      DEMO_FEATURE_OVERRIDES,
    );
  });

  it('resolves every listed capability to false, from the org override', () => {
    const resolved = resolveFeatures({
      orgOverrides: { ...DEMO_FEATURE_OVERRIDES },
    });

    for (const key of Object.keys(
      DEMO_FEATURE_OVERRIDES,
    ) as (keyof typeof DEMO_FEATURE_OVERRIDES)[]) {
      expect(resolved[key]).toEqual({ value: false, source: 'org-override' });
    }
  });

  it('turns off the three write restrictions and the two sharing surfaces', () => {
    // Named rather than derived: losing one should fail here rather than in
    // front of a prospect.
    expect(DEMO_FEATURE_OVERRIDES.manageDocuments).toBe(false);
    expect(DEMO_FEATURE_OVERRIDES.manageProjects).toBe(false);
    expect(DEMO_FEATURE_OVERRIDES.manageOrganizationSettings).toBe(false);
    expect(DEMO_FEATURE_OVERRIDES.inviteMembers).toBe(false);
    expect(DEMO_FEATURE_OVERRIDES.mcpConnectors).toBe(false);
  });

  it('does not restrict the conversation surface', () => {
    const restricted = Object.keys(DEMO_FEATURE_OVERRIDES);

    expect(restricted).not.toContain('publicChatbot');
    expect(restricted).not.toContain('publicThreadLinks');
  });

  it('sets a spend cap rather than leaving it unbounded', () => {
    expect(DEMO_MONTHLY_COST_LIMIT_CENTS).toBeGreaterThan(0);
  });

  it('bundles exactly what the seed writes and the nightly job restores', () => {
    // The worker restores this object verbatim. Anything else in it would be
    // rewritten every night, so a new column here is a decision, not a default.
    expect(Object.keys(DEMO_ORGANIZATION_RESTRICTIONS).sort()).toEqual([
      'featureOverrides',
      'monthlyCostLimitCents',
    ]);
    expect(DEMO_ORGANIZATION_RESTRICTIONS.featureOverrides).toBe(
      DEMO_FEATURE_OVERRIDES,
    );
    expect(DEMO_ORGANIZATION_RESTRICTIONS.monthlyCostLimitCents).toBe(
      DEMO_MONTHLY_COST_LIMIT_CENTS,
    );
  });
});
