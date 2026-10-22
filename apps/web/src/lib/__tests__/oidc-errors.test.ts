import { describe, expect, it } from 'vitest';

import en from '@/app/messages/en.json';

import { SIGN_IN_REFUSAL, ssoErrorMessageKey } from '../oidc-errors';

describe('ssoErrorMessageKey', () => {
  it('shows nothing without an error', () => {
    expect(ssoErrorMessageKey(null)).toBeNull();
    expect(ssoErrorMessageKey('')).toBeNull();
  });

  it.each([
    ['registration_disabled', 'sso-error-registration-disabled'],
    ['oidc_domain_not_allowed', 'sso-error-domain'],
    ['oidc_hosted_domain_mismatch', 'sso-error-hosted-domain'],
    ['oidc_email_not_verified', 'sso-error-email-not-verified'],
    ['oidc_join_organization_unset', 'sso-error-join-organization-unset'],
    [
      'oidc_join_organization_not_found',
      'sso-error-join-organization-not-found',
    ],
    ['email_not_found', 'sso-error-email-missing'],
    ['account_not_linked', 'sso-error-account-not-linked'],
    ['access_denied', 'sso-error-cancelled'],
  ])('gives %s its own sentence', (code, key) => {
    expect(ssoErrorMessageKey(code)).toBe(key);
  });

  it('gives a code it does not know the general sentence', () => {
    expect(ssoErrorMessageKey('state_mismatch')).toBe('sso-failed');
    expect(ssoErrorMessageKey('sso_failed')).toBe('sso-failed');
  });

  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'gives %s, inherited from Object.prototype, the general sentence',
    (code) => {
      expect(ssoErrorMessageKey(code)).toBe('sso-failed');
    },
  );

  it('has a sentence for every refusal the server sends', () => {
    for (const code of Object.values(SIGN_IN_REFUSAL)) {
      expect(ssoErrorMessageKey(code), code).not.toBe('sso-failed');
    }
  });

  it('names only keys that exist in the messages', () => {
    const signIn = en['sign-in'] as Record<string, string>;
    for (const code of [
      ...Object.values(SIGN_IN_REFUSAL),
      'account_not_linked',
      'access_denied',
      'unknown',
    ]) {
      expect(signIn[ssoErrorMessageKey(code)!], code).toEqual(
        expect.any(String),
      );
    }
  });
});
