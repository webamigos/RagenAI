import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  FEATURE_LABELS,
  INSTANCE_FEATURE_KEYS,
  resolveFeatures,
  resolveInstanceFeature,
} from '../features';

describe('instanceBranding', () => {
  it('is a declared key, off by default while it is built (ADR-50)', () => {
    expect(FEATURE_KEYS).toContain('instanceBranding');
    expect(DEFAULT_FEATURES.instanceBranding).toBe(false);
    expect(FEATURE_LABELS.instanceBranding).toMatch(/instance-wide/);
    expect(resolveFeatures({}).instanceBranding.value).toBe(false);
  });

  it('is instance-wide, so every instance key is also a feature key', () => {
    expect(INSTANCE_FEATURE_KEYS).toContain('instanceBranding');
    for (const key of INSTANCE_FEATURE_KEYS) {
      expect(FEATURE_KEYS).toContain(key);
    }
  });
});

describe('resolveInstanceFeature', () => {
  it('falls back to the code default with no platform defaults', () => {
    expect(resolveInstanceFeature('instanceBranding', null)).toEqual({
      value: false,
      source: 'code-default',
    });
    expect(resolveInstanceFeature('instanceBranding', undefined)).toEqual({
      value: false,
      source: 'code-default',
    });
  });

  it('reads the platform default when an operator set one', () => {
    expect(
      resolveInstanceFeature('instanceBranding', { instanceBranding: true }),
    ).toEqual({ value: true, source: 'platform-default' });
  });

  it('treats a null platform default as inherit', () => {
    expect(
      resolveInstanceFeature('instanceBranding', { instanceBranding: null })
        .value,
    ).toBe(false);
  });

  it('ignores a value that is not a boolean, as a hand-edited row may hold', () => {
    expect(
      resolveInstanceFeature('instanceBranding', {
        instanceBranding: 'yes',
      } as unknown as Record<string, boolean>).value,
    ).toBe(false);
  });
});
