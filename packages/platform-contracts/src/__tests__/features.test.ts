import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  FEATURE_LABELS,
  flattenFeatures,
  resolveFeatures,
  sanitizeFeatureOverrides,
} from '../features/features';

describe('the feature key set', () => {
  it('has no duplicate', () => {
    expect(new Set(FEATURE_KEYS).size).toBe(FEATURE_KEYS.length);
  });

  // A key with no code default resolves to `undefined` when neither the plan
  // nor an org override sets it, which reads as "off" without saying so.
  it('has a code default for every key', () => {
    expect(Object.keys(DEFAULT_FEATURES).sort()).toEqual(
      [...FEATURE_KEYS].sort(),
    );
  });

  it('has a non-empty label for every key, and no label for anything else', () => {
    expect(Object.keys(FEATURE_LABELS).sort()).toEqual(
      [...FEATURE_KEYS].sort(),
    );
    for (const key of FEATURE_KEYS) {
      expect(FEATURE_LABELS[key].trim()).not.toBe('');
    }
  });

  it('defaults every value to a boolean, never null', () => {
    for (const value of Object.values(DEFAULT_FEATURES)) {
      expect(typeof value).toBe('boolean');
    }
  });

  /**
   * These four gate a surface that is off until a platform administrator opts
   * an organization in (commits 852–854). A default flipping to true would
   * silently expose voice, public links or the external chatbot for every
   * organization at once, which is precisely what those changes undid.
   */
  it.each([
    ['inviteMembers'],
    ['publicChatbot'],
    ['voiceInput'],
    ['publicThreadLinks'],
  ] as const)('keeps %s opt-in', (key) => {
    expect(DEFAULT_FEATURES[key]).toBe(false);
  });
});

describe('sanitizeFeatureOverrides', () => {
  it('keeps explicit true, false and inherit', () => {
    expect(
      sanitizeFeatureOverrides({
        voiceInput: true,
        apiAccess: false,
        publicChatbot: null,
      }),
    ).toEqual({ voiceInput: true, apiAccess: false, publicChatbot: null });
  });

  // The column is untyped JSON: a stale key from an older release, or a
  // hand-edited row, must not reach a form as a toggle nothing reads.
  it('drops a key that is not a feature', () => {
    expect(
      sanitizeFeatureOverrides({ voiceInput: true, retiredFlag: true }),
    ).toEqual({ voiceInput: true });
  });

  it.each([
    ['a string', 'yes'],
    ['a number', 1],
    ['an object', {}],
    ['undefined', undefined],
  ])('drops %s value', (_label, value) => {
    expect(sanitizeFeatureOverrides({ voiceInput: value })).toEqual({});
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
  ])('returns an empty object for %s input', (_label, input) => {
    expect(sanitizeFeatureOverrides(input)).toEqual({});
  });

  it('returns an empty object for an empty input', () => {
    expect(sanitizeFeatureOverrides({})).toEqual({});
  });

  it('never invents a key that was absent', () => {
    const result = sanitizeFeatureOverrides({ voiceInput: true });
    expect(Object.keys(result)).toEqual(['voiceInput']);
  });
});

describe('resolveFeatures', () => {
  it('prefers an organization override over everything below it', () => {
    const resolved = resolveFeatures({
      orgOverrides: { apiAccess: false },
      planFeatures: { apiAccess: true },
      platformDefaults: { apiAccess: true },
    });

    expect(resolved.apiAccess).toEqual({
      value: false,
      source: 'org-override',
    });
  });

  it('prefers the plan over the platform default', () => {
    const resolved = resolveFeatures({
      planFeatures: { publicChatbot: true },
      platformDefaults: { publicChatbot: false },
    });

    expect(resolved.publicChatbot).toEqual({ value: true, source: 'plan' });
  });

  /**
   * The layer ADR-35 added. Without it, a self-hosted installation could only
   * answer "is API access on" by setting an override on each organization one
   * at a time.
   */
  it('uses the platform default when no plan and no override say otherwise', () => {
    const resolved = resolveFeatures({
      platformDefaults: { inviteMembers: true },
    });

    expect(resolved.inviteMembers).toEqual({
      value: true,
      source: 'platform-default',
    });
  });

  it('falls through to the code default when nothing is configured', () => {
    const resolved = resolveFeatures({});

    expect(resolved.apiAccess).toEqual({ value: true, source: 'code-default' });
    expect(resolved.voiceInput).toEqual({
      value: false,
      source: 'code-default',
    });
  });

  /**
   * `null` means inherit at every layer, and an explicit `false` must beat a
   * lower layer's `true`. Truthiness checks get both of these wrong, which is
   * why the resolver tests each value against `true`/`false` explicitly.
   */
  it('treats null as inherit rather than as false', () => {
    const resolved = resolveFeatures({
      orgOverrides: { apiAccess: null },
      planFeatures: { apiAccess: null },
      platformDefaults: { apiAccess: false },
    });

    expect(resolved.apiAccess).toEqual({
      value: false,
      source: 'platform-default',
    });
  });

  it('lets an explicit false at a higher layer beat a true below it', () => {
    const resolved = resolveFeatures({
      planFeatures: { mcpConnectors: false },
      platformDefaults: { mcpConnectors: true },
    });

    expect(resolved.mcpConnectors).toEqual({ value: false, source: 'plan' });
  });

  it('ignores unrecognised keys from a hand-edited JSON column', () => {
    const resolved = resolveFeatures({
      orgOverrides: { legacyFlag: true } as never,
    });

    expect(Object.keys(resolved).sort()).toEqual([...FEATURE_KEYS].sort());
  });

  it('answers every key, so a gate can never read undefined', () => {
    const resolved = resolveFeatures({});

    for (const key of FEATURE_KEYS) {
      expect(typeof resolved[key].value).toBe('boolean');
    }
  });

  /**
   * The write-restriction keys default to `true` so that adding them takes
   * nothing away from an existing installation. That makes the org override
   * the only thing standing between a frozen tenant and a writable one, so it
   * is worth asserting directly rather than trusting the generic
   * override-beats-default case above.
   */
  it.each([
    'manageDocuments',
    'manageProjects',
    'manageOrganizationSettings',
  ] as const)('leaves %s on unless an organization turns it off', (key) => {
    expect(resolveFeatures({})[key]).toEqual({
      value: true,
      source: 'code-default',
    });

    expect(resolveFeatures({ orgOverrides: { [key]: false } })[key]).toEqual({
      value: false,
      source: 'org-override',
    });
  });
});

describe('flattenFeatures', () => {
  it('drops the sources and keeps the values', () => {
    const flags = flattenFeatures(
      resolveFeatures({ platformDefaults: { voiceInput: true } }),
    );

    expect(flags.voiceInput).toBe(true);
    expect(flags).not.toHaveProperty('voiceInput.source');
  });
});
