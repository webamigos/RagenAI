import { describe, expect, it } from 'vitest';

import { isBasalConfigured } from '../config';

describe('isBasalConfigured', () => {
  it('is false without BASAL_URL, so a fresh install never asks basal', () => {
    expect(isBasalConfigured({})).toBe(false);
  });

  it('reads a blank BASAL_URL as unset, the way a cleared Railway variable looks', () => {
    expect(isBasalConfigured({ BASAL_URL: '   ' })).toBe(false);
  });

  it('is true once a URL is set', () => {
    expect(isBasalConfigured({ BASAL_URL: 'http://basal:8000' })).toBe(true);
  });
});
