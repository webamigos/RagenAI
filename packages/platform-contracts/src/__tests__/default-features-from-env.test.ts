import { describe, expect, it } from 'vitest';

import {
  applyDefaultFeatures,
  parseDefaultFeatures,
} from '../features/default-features-from-env';

describe('parseDefaultFeatures', () => {
  it('reads nothing from an unset or blank variable', () => {
    expect(parseDefaultFeatures(undefined)).toEqual([]);
    expect(parseDefaultFeatures('')).toEqual([]);
    expect(parseDefaultFeatures(' , ')).toEqual([]);
  });

  it('reads a comma-separated list, trimmed and without repeats', () => {
    expect(parseDefaultFeatures(' brain, brainAssistant ,brain')).toEqual([
      'brain',
      'brainAssistant',
    ]);
  });

  it('refuses a key that does not exist, naming it', () => {
    // Skipping it would do nothing on every deploy and say nothing.
    expect(() => parseDefaultFeatures('brain,brian')).toThrow(/brian/);
  });
});

describe('applyDefaultFeatures', () => {
  it('switches a key on where the platform defaults do not decide it', () => {
    expect(applyDefaultFeatures({}, ['brain'])).toEqual({
      next: { brain: true },
      added: ['brain'],
    });
  });

  it('never overrules a value already saved, including false', () => {
    // An administrator who turned Brain off is not overruled by the next
    // deploy re-running the seed.
    expect(applyDefaultFeatures({ brain: false }, ['brain'])).toEqual({
      next: { brain: false },
      added: [],
    });
  });

  it('keeps the keys it was not asked about', () => {
    expect(applyDefaultFeatures({ apiAccess: false }, ['brain']).next).toEqual({
      apiAccess: false,
      brain: true,
    });
  });
});
