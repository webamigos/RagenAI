import { describe, expect, it } from 'vitest';

import {
  gateProfile,
  googleHostedDomainHint,
  isAllowedEmail,
  issuerEmailVerified,
  isOidcCallback,
  oidcConfigFromEnv,
} from '../oidc-config';

const valid = {
  OIDC_ISSUER: 'https://login.example.com/tenant/v2.0/',
  OIDC_CLIENT_ID: 'client',
  OIDC_CLIENT_SECRET: 'secret',
  OIDC_ALLOWED_DOMAINS: 'Acme.pl, @acme.com',
};

describe('oidcConfigFromEnv', () => {
  it('is off when nothing is set', () => {
    expect(oidcConfigFromEnv({})).toEqual({ status: 'off' });
  });

  it('reads a full configuration and derives the discovery URL', () => {
    expect(oidcConfigFromEnv(valid)).toEqual({
      status: 'on',
      config: {
        issuer: 'https://login.example.com/tenant/v2.0',
        kind: 'generic',
        entraTenantId: null,
        discoveryUrl:
          'https://login.example.com/tenant/v2.0/.well-known/openid-configuration',
        clientId: 'client',
        clientSecret: 'secret',
        allowedDomains: ['acme.pl', 'acme.com'],
        displayName: 'company account',
        joinOrganization: null,
        trustEmail: false,
        requireHostedDomain: false,
      },
    });
  });

  it('carries the display name and the organization to join', () => {
    const result = oidcConfigFromEnv({
      ...valid,
      OIDC_DISPLAY_NAME: 'Microsoft',
      OIDC_JOIN_ORGANIZATION: 'acme',
    });
    expect(result).toMatchObject({
      status: 'on',
      config: { displayName: 'Microsoft', joinOrganization: 'acme' },
    });
  });

  it('refuses a configuration with no allowed domains', () => {
    // An issuer such as Google's vouches for accounts the install has nothing
    // to do with; "anyone it knows" is never the intended audience.
    expect(
      oidcConfigFromEnv({ ...valid, OIDC_ALLOWED_DOMAINS: ' , ' }),
    ).toEqual({
      status: 'invalid',
      problems: ['OIDC_ALLOWED_DOMAINS is not set'],
    });
  });

  it('names every missing piece of a partial configuration', () => {
    const result = oidcConfigFromEnv({ OIDC_ISSUER: 'not a url' });
    expect(result).toEqual({
      status: 'invalid',
      problems: [
        'OIDC_ISSUER is not an http(s) URL',
        'OIDC_CLIENT_ID is not set',
        'OIDC_CLIENT_SECRET is not set',
        'OIDC_ALLOWED_DOMAINS is not set',
      ],
    });
  });

  it('refuses a domain entry that is not a domain', () => {
    expect(
      oidcConfigFromEnv({ ...valid, OIDC_ALLOWED_DOMAINS: 'acme.pl,*' }),
    ).toMatchObject({ status: 'invalid' });
  });
});

describe('the domain gate', () => {
  const domains = ['acme.pl'];

  it('matches the domain exactly, ignoring case', () => {
    expect(isAllowedEmail('Jan@ACME.pl', domains)).toBe(true);
    expect(isAllowedEmail('jan@sub.acme.pl', domains)).toBe(false);
    expect(isAllowedEmail('jan@acme.pl.evil.com', domains)).toBe(false);
    expect(isAllowedEmail('acme.pl', domains)).toBe(false);
    expect(isAllowedEmail(null, domains)).toBe(false);
  });

  it('empties the email outside the allowed domains, which the callback refuses', () => {
    expect(
      gateProfile({ email: 'eve@gmail.com', emailVerified: true }, domains),
    ).toEqual({ email: '', emailVerified: false });
  });

  it('fills in a missing claim only when the operator trusts the issuer', () => {
    // Entra ID sends no email_verified. A tenant that owns the allowed domains
    // is trusted with OIDC_TRUST_EMAIL; an explicit `false` is never overridden.
    expect(
      gateProfile({ email: 'jan@acme.pl', emailVerified: null }, domains, {
        trustEmail: true,
      }),
    ).toEqual({ email: 'jan@acme.pl', emailVerified: true });
    expect(
      gateProfile({ email: 'jan@acme.pl', emailVerified: false }, domains, {
        trustEmail: true,
      }),
    ).toEqual({ email: 'jan@acme.pl', emailVerified: false });
    expect(
      gateProfile({ email: 'eve@gmail.com', emailVerified: null }, domains, {
        trustEmail: true,
      }),
    ).toEqual({ email: '', emailVerified: false });
  });

  it('passes verification through only for an allowed domain', () => {
    expect(
      gateProfile({ email: 'Jan@acme.pl', emailVerified: true }, domains),
    ).toEqual({ email: 'jan@acme.pl', emailVerified: true });
    expect(
      gateProfile({ email: 'jan@acme.pl', emailVerified: null }, domains),
    ).toEqual({ email: 'jan@acme.pl', emailVerified: false });
  });
});

describe('isOidcCallback', () => {
  it('recognises this provider’s callback, and nothing else', () => {
    expect(
      isOidcCallback({ path: '/callback/:id', params: { id: 'oidc' } }),
    ).toBe(true);
    expect(isOidcCallback({ path: '/callback/oidc' })).toBe(true);
    expect(
      isOidcCallback({ path: '/callback/:id', params: { id: 'google' } }),
    ).toBe(false);
    expect(isOidcCallback({ path: '/sign-up/email' })).toBe(false);
    expect(isOidcCallback(null)).toBe(false);
  });

  it('requires the hosted-domain claim for Google', () => {
    // Google's email_verified proves the address, not Workspace membership: a
    // personal Google account can be made on a company address. `hd` is set
    // only for accounts the Workspace manages.
    expect(
      oidcConfigFromEnv({
        ...valid,
        OIDC_ISSUER: 'https://accounts.google.com',
      }),
    ).toMatchObject({ status: 'on', config: { requireHostedDomain: true } });

    const google = { requireHostedDomain: true };
    expect(
      gateProfile(
        { email: 'jan@acme.pl', emailVerified: true },
        ['acme.pl'],
        google,
      ),
    ).toEqual({ email: '', emailVerified: false });
    expect(
      gateProfile(
        {
          email: 'jan@acme.pl',
          emailVerified: true,
          hostedDomain: 'gmail.com',
        },
        ['acme.pl'],
        google,
      ),
    ).toEqual({ email: '', emailVerified: false });
    expect(
      gateProfile(
        { email: 'jan@acme.pl', emailVerified: true, hostedDomain: 'ACME.pl' },
        ['acme.pl'],
        google,
      ),
    ).toEqual({ email: 'jan@acme.pl', emailVerified: true });
  });
});

describe('Microsoft Entra ID', () => {
  const tenant = '6F1B2C3D-0000-4000-8000-00000000ABCD';

  it('recognises a tenant named by GUID, with or without /v2.0', () => {
    for (const issuer of [
      `https://login.microsoftonline.com/${tenant}/v2.0`,
      `https://login.microsoftonline.com/${tenant}`,
    ]) {
      expect(
        oidcConfigFromEnv({ ...valid, OIDC_ISSUER: issuer }),
      ).toMatchObject({
        status: 'on',
        config: {
          kind: 'microsoft-entra-id',
          entraTenantId: tenant.toLowerCase(),
          requireHostedDomain: false,
        },
      });
    }
  });

  it('refuses a multi-tenant authority', () => {
    // Its discovery issuer is a `{tenantid}` template no ID token matches, and
    // it vouches for every Entra tenant there is.
    for (const authority of ['common', 'organizations', 'Consumers']) {
      expect(
        oidcConfigFromEnv({
          ...valid,
          OIDC_ISSUER: `https://login.microsoftonline.com/${authority}/v2.0`,
        }),
      ).toEqual({
        status: 'invalid',
        problems: [
          'OIDC_ISSUER names a multi-tenant Microsoft authority (common, organizations or consumers); use your tenant ID',
        ],
      });
    }
  });

  it('keeps a tenant named by domain on the generic path', () => {
    expect(
      oidcConfigFromEnv({
        ...valid,
        OIDC_ISSUER:
          'https://login.microsoftonline.com/acme.onmicrosoft.com/v2.0',
      }),
    ).toMatchObject({
      status: 'on',
      config: { kind: 'generic', entraTenantId: null },
    });
  });
});

describe('googleHostedDomainHint', () => {
  it('names the one allowed domain, or any Workspace for several', () => {
    expect(googleHostedDomainHint(['acme.pl'])).toBe('acme.pl');
    expect(googleHostedDomainHint(['acme.pl', 'acme.com'])).toBe('*');
  });

  it('marks Google as its own kind', () => {
    expect(
      oidcConfigFromEnv({
        ...valid,
        OIDC_ISSUER: 'https://accounts.google.com',
      }),
    ).toMatchObject({ status: 'on', config: { kind: 'google' } });
  });
});

describe('issuerEmailVerified', () => {
  it('believes an explicit email_verified claim either way', () => {
    expect(issuerEmailVerified({ email_verified: true })).toBe(true);
    expect(issuerEmailVerified({ email_verified: false })).toBe(false);
  });

  it('is null when the issuer says nothing, so OIDC_TRUST_EMAIL can fill it in', () => {
    // Better Auth's Entra helper reports a missing claim as `emailVerified:
    // false`; reading that instead would make the setting a no-op on Entra.
    expect(
      issuerEmailVerified({ email: 'jan@acme.pl', emailVerified: false }),
    ).toBeNull();
  });

  it("reads Entra's verified_primary_email / verified_secondary_email claims", () => {
    expect(
      issuerEmailVerified({
        email: 'Jan@acme.pl',
        verified_primary_email: ['jan@acme.pl'],
      }),
    ).toBe(true);
    expect(
      issuerEmailVerified({
        email: 'jan@acme.pl',
        verified_secondary_email: ['other@acme.pl'],
      }),
    ).toBe(false);
  });
});
