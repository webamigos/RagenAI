import { expect, it } from 'vitest';
import {
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  FEATURE_LABELS,
  resolveFeatures,
} from '../features';
it('keeps heuristic Brain warnings opt-in in the shared feature contract', () => {
  expect(FEATURE_KEYS).toContain('brainParaphraseWarnings');
  expect(DEFAULT_FEATURES.brainParaphraseWarnings).toBe(false);
  expect(FEATURE_LABELS.brainParaphraseWarnings).toBeTruthy();
  expect(
    resolveFeatures({ orgOverrides: { brainParaphraseWarnings: true } })
      .brainParaphraseWarnings.value,
  ).toBe(true);
});
