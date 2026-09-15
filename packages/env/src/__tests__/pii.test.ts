import { describe, expect, it } from 'vitest';

import {
  isPiiMaskingConfigured,
  isPiiMaskingEnabled,
  isPiiMaskingMisconfigured,
} from '../pii';

const both = {
  PRESIDIO_ANALYZER_URL: 'http://presidio-analyzer:3000',
  PRESIDIO_ANONYMIZER_URL: 'http://presidio-anonymizer:3000',
} as NodeJS.ProcessEnv;

describe('isPiiMaskingConfigured', () => {
  it('needs both halves', () => {
    expect(isPiiMaskingConfigured(both)).toBe(true);
    expect(
      isPiiMaskingConfigured({
        PRESIDIO_ANALYZER_URL: both.PRESIDIO_ANALYZER_URL,
      } as NodeJS.ProcessEnv),
    ).toBe(false);
    expect(
      isPiiMaskingConfigured({
        PRESIDIO_ANONYMIZER_URL: both.PRESIDIO_ANONYMIZER_URL,
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it('is unconfigured when nothing is set', () => {
    expect(isPiiMaskingConfigured({} as NodeJS.ProcessEnv)).toBe(false);
  });

  /** A cleared Railway variable arrives as '' rather than undefined. */
  it.each(['', '   '])('treats a blank value as unset (%j)', (blank) => {
    expect(
      isPiiMaskingConfigured({
        ...both,
        PRESIDIO_ANALYZER_URL: blank,
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });
});

describe('isPiiMaskingEnabled', () => {
  it('masks once configured, with no flag set', () => {
    expect(isPiiMaskingEnabled(both)).toBe(true);
  });

  it('never masks without somewhere to send the text', () => {
    expect(
      isPiiMaskingEnabled({
        FEATURE_FLAG_PII_MASKING: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it('is switched off by the kill switch', () => {
    expect(
      isPiiMaskingEnabled({
        ...both,
        FEATURE_FLAG_PII_MASKING: '0',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  /**
   * Only `0` switches off. The flag used to be the enabler, so `=1` is still
   * in deployments that want masking — reading it as anything but "on" would
   * turn a security control off during an upgrade.
   */
  it.each(['1', 'true', 'yes', ''])(
    'keeps masking for any other flag value (%j)',
    (value) => {
      expect(
        isPiiMaskingEnabled({
          ...both,
          FEATURE_FLAG_PII_MASKING: value,
        } as NodeJS.ProcessEnv),
      ).toBe(true);
    },
  );
});

describe('isPiiMaskingMisconfigured', () => {
  it('catches the upgrade that would silently stop masking', () => {
    expect(
      isPiiMaskingMisconfigured({
        FEATURE_FLAG_PII_MASKING: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it('is quiet once the URLs are there', () => {
    expect(
      isPiiMaskingMisconfigured({
        ...both,
        FEATURE_FLAG_PII_MASKING: '1',
      } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  it('is quiet for a deployment that never asked for masking', () => {
    expect(isPiiMaskingMisconfigured({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
