import { expect, it } from 'vitest';
import {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  FEATURE_LABELS,
  resolveFeatures,
} from '../features';

it('keeps language pairs off until the feature is complete (ADR-50)', () => {
  expect(FEATURE_KEYS).toContain('languagePairs');
  expect(DEFAULT_FEATURES.languagePairs).toBe(false);
  expect(FEATURE_LABELS.languagePairs).toBeTruthy();
  expect(resolveFeatures({}).languagePairs.value).toBe(false);
  expect(
    resolveFeatures({ orgOverrides: { languagePairs: true } }).languagePairs
      .value,
  ).toBe(true);
});
