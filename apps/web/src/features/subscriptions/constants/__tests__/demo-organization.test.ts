import { describe, expect, it } from 'vitest';

import {
  DEMO_FEATURE_OVERRIDES,
  DEMO_MONTHLY_COST_LIMIT_CENTS,
} from '../demo-organization';
import {
  FEATURE_KEYS,
  resolveFeatures,
  sanitizeFeatureOverrides,
} from '@/features/subscriptions/contracts/features.types';

/**
 * These constants have a failure mode that reports nothing.
 *
 * `featureOverrides` is an untyped JSON column and `sanitizeFeatureOverrides`
 * **drops any key it does not recognise**. So a misspelled key —
 * `manageDocument` for `manageDocuments` — writes a row that looks correct,
 * resolves to the built-in default of `true`, and leaves the demo tenant
 * writable. Nothing surfaces it: not the write, not the admin panel (which
 * renders only known keys), not a glance at the database. The first sign would
 * be a prospect deleting the corpus.
 *
 * `as const satisfies FeatureOverrides` catches it at compile time now that
 * these live outside `src/scripts` — which `apps/web/tsconfig.json` excludes,
 * and where an earlier draft of this had put them. These tests are the second
 * line, and they check what the app will actually resolve rather than what was
 * written down.
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

  it('turns off the three write restrictions Phase B added', () => {
    // Named rather than derived: these three are the point of the demo tenant,
    // and losing one should fail here rather than in front of a prospect.
    expect(DEMO_FEATURE_OVERRIDES.manageDocuments).toBe(false);
    expect(DEMO_FEATURE_OVERRIDES.manageProjects).toBe(false);
    expect(DEMO_FEATURE_OVERRIDES.manageOrganizationSettings).toBe(false);
  });

  it('does not restrict the conversation surface', () => {
    // A demo that cannot chat is not a demo. Whatever else is frozen, the
    // thing being demonstrated has to keep working.
    const restricted = Object.keys(DEMO_FEATURE_OVERRIDES);

    expect(restricted).not.toContain('publicChatbot');
    expect(restricted).not.toContain('publicThreadLinks');
  });

  it('sets a spend cap rather than leaving it unbounded', () => {
    // With one shared account there is no per-visitor rate limit; this is the
    // only backstop against a scripted visitor.
    expect(DEMO_MONTHLY_COST_LIMIT_CENTS).toBeGreaterThan(0);
  });
});
