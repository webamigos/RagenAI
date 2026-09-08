import { describe, expect, it } from 'vitest';

import {
  REGISTRATION_ENABLED_BY_DEFAULT,
  REGISTRATION_ENABLED_KEY,
  registrationIsEnabled,
  registrationSettingValue,
} from '../registration';

describe('registration setting', () => {
  it('is closed when the installation has never decided', () => {
    // The case that matters most: a fresh database has no row at all, and a
    // reachable install with an open sign-up form is how a stranger gets the
    // first account.
    expect(registrationIsEnabled(undefined)).toBe(false);
    expect(registrationIsEnabled(null)).toBe(false);
    expect(REGISTRATION_ENABLED_BY_DEFAULT).toBe(false);
  });

  it('opens only for the exact string true', () => {
    expect(registrationIsEnabled('true')).toBe(true);
  });

  it("treats 'false' as closed, which Boolean() would not", () => {
    // Boolean('false') === true. This is the whole reason the read goes
    // through a function instead of being inlined at each call site.
    expect(registrationIsEnabled('false')).toBe(false);
    expect(Boolean('false')).toBe(true);
  });

  it('closes on anything it does not recognise', () => {
    // A hand-edited row, a typo, a half-applied migration, a value written by
    // an older version. None of these are consent to open registration.
    for (const value of [
      'TRUE',
      'True',
      '1',
      'yes',
      'on',
      '',
      ' true',
      'true ',
    ]) {
      expect(
        registrationIsEnabled(value),
        `value: ${JSON.stringify(value)}`,
      ).toBe(false);
    }
  });

  it('round-trips through the value it persists', () => {
    expect(registrationIsEnabled(registrationSettingValue(true))).toBe(true);
    expect(registrationIsEnabled(registrationSettingValue(false))).toBe(false);
  });

  it('names the settings key once', () => {
    expect(REGISTRATION_ENABLED_KEY).toBe('registration_enabled');
  });
});
