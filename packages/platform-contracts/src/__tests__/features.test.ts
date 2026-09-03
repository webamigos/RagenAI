import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  FEATURE_LABELS,
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
