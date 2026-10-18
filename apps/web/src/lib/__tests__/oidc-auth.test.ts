import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  organization: { findFirst: vi.fn() },
  member: { create: vi.fn() },
}));
vi.mock('@ragenai/prisma-client', () => ({ default: db }));

const ensureDefaultTeamMembershipCommand = vi.hoisted(() => vi.fn());
vi.mock(
  '@/features/teams/services/commands/ensure-default-team-membership-command',
  () => ({ ensureDefaultTeamMembershipCommand }),
);

// Pass the plugin options through, so the provider config can be inspected.
vi.mock('better-auth/plugins', async (importOriginal) => ({
  ...(await importOriginal<typeof import('better-auth/plugins')>()),
  genericOAuth: (options: unknown) => options,
}));

import {
  joinOidcOrganization,
  oidcPlugins,
  oidcSignUpAdmitted,
} from '../oidc-auth';

const callback = { path: '/callback/:id', params: { id: 'oidc' } };
const passwordSignUp = { path: '/sign-up/email' };

function configure(extra: Record<string, string> = {}) {
  vi.stubEnv('OIDC_ISSUER', 'https://idp.example.com');
  vi.stubEnv('OIDC_CLIENT_ID', 'client');
  vi.stubEnv('OIDC_CLIENT_SECRET', 'secret');
  vi.stubEnv('OIDC_ALLOWED_DOMAINS', 'acme.pl');
  for (const [name, value] of Object.entries(extra)) {
    vi.stubEnv(name, value);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('oidcPlugins', () => {
  it('adds nothing when company sign-in is not configured', () => {
    expect(oidcPlugins()).toEqual([]);
  });

  it('adds the generic OAuth plugin when it is', () => {
    configure();
    expect(oidcPlugins()).toHaveLength(1);
  });

  type ProviderConfig = {
    providerId: string;
    authorizationUrl?: string;
    discoveryUrl?: string;
    authorizationUrlParams?: Record<string, string>;
    accountSubject?: (data: { profile: Record<string, unknown> }) => string;
    mapProfileToUser: (profile: Record<string, unknown>) => {
      email: string;
      emailVerified: boolean;
    };
  };
  const provider = () =>
    (oidcPlugins()[0] as unknown as { config: ProviderConfig[] }).config[0]!;

  it('uses discovery and no hd hint for a generic issuer', () => {
    configure();
    expect(provider()).toMatchObject({
      providerId: 'oidc',
      discoveryUrl: 'https://idp.example.com/.well-known/openid-configuration',
    });
    expect(provider().authorizationUrlParams).toBeUndefined();
  });

  it("wires an Entra tenant through Better Auth's helper, keeping the provider id", () => {
    const tenant = '6f1b2c3d-0000-4000-8000-00000000abcd';
    configure({
      OIDC_ISSUER: `https://login.microsoftonline.com/${tenant}/v2.0`,
      OIDC_TRUST_EMAIL: 'true',
    });
    const entra = provider();

    // The callback URL registered at the IdP is `/callback/oidc` either way.
    expect(entra.providerId).toBe('oidc');
    expect(entra.authorizationUrl).toBe(
      `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    );
    // Keyed on the immutable object id, not the per-application `sub`.
    expect(
      entra.accountSubject?.({ profile: { oid: 'object-1', sub: 'pairwise' } }),
    ).toBe('object-1');
    // Entra sends no email_verified; the helper's `false` does not stop
    // OIDC_TRUST_EMAIL from filling it in, and the domain gate still applies.
    expect(
      entra.mapProfileToUser({ email: 'Jan@acme.pl', emailVerified: false }),
    ).toEqual({ email: 'jan@acme.pl', emailVerified: true });
    expect(
      entra.mapProfileToUser({ email: 'eve@evil.com', emailVerified: true }),
    ).toEqual({ email: '', emailVerified: false });
  });

  it('asks Google for a Workspace account of the allowed domain', () => {
    configure({ OIDC_ISSUER: 'https://accounts.google.com' });
    expect(provider().authorizationUrlParams).toEqual({ hd: 'acme.pl' });
    // The hint shapes the chooser; the hd claim is still what admits.
    expect(
      provider().mapProfileToUser({
        email: 'jan@acme.pl',
        email_verified: true,
      }),
    ).toEqual({ email: '', emailVerified: false });
  });
});

const verified = { email: 'jan@acme.pl', emailVerified: true };

describe('oidcSignUpAdmitted', () => {
  beforeEach(() => {
    db.organization.findFirst.mockResolvedValue({ id: 'org-acme' });
  });

  it('admits a verified allowed address arriving through the OIDC callback, into an existing organization', async () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });
    await expect(oidcSignUpAdmitted(verified, callback)).resolves.toBe(true);
  });

  it('does not admit a password sign-up for the same domain', async () => {
    // The callback path is what makes it a company sign-in. Without this, an
    // unverified email-and-password sign-up at the company's domain would
    // walk past closed registration into the company's organization.
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });
    await expect(oidcSignUpAdmitted(verified, passwordSignUp)).resolves.toBe(
      false,
    );
  });

  it('does not admit an address the issuer did not verify', async () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });
    await expect(
      oidcSignUpAdmitted({ ...verified, emailVerified: false }, callback),
    ).resolves.toBe(false);
  });

  it('does not admit without an organization to join', async () => {
    configure();
    await expect(oidcSignUpAdmitted(verified, callback)).resolves.toBe(false);
  });

  it('does not admit into an organization that does not exist', async () => {
    // Falling back to a personal organization later would let an
    // allowed-domain user past closed registration on a typo.
    configure({ OIDC_JOIN_ORGANIZATION: 'missing' });
    db.organization.findFirst.mockResolvedValue(null);
    await expect(oidcSignUpAdmitted(verified, callback)).resolves.toBe(false);
  });

  it('does not admit an address outside the allowed domains', async () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });
    await expect(
      oidcSignUpAdmitted(
        { email: 'eve@gmail.com', emailVerified: true },
        callback,
      ),
    ).resolves.toBe(false);
  });
});

describe('joinOidcOrganization', () => {
  const user = { id: 'user-1', email: 'jan@acme.pl', emailVerified: true };

  it('adds the user to the configured organization as a member', async () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });
    db.organization.findFirst.mockResolvedValue({ id: 'org-acme' });

    await expect(joinOidcOrganization(user, callback)).resolves.toBe(true);

    expect(db.organization.findFirst).toHaveBeenCalledWith({
      where: { OR: [{ id: 'acme' }, { slug: 'acme' }] },
      select: { id: true },
    });
    expect(db.member.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: 'org-acme',
        userId: 'user-1',
        role: 'member',
      }),
    });
    expect(ensureDefaultTeamMembershipCommand).toHaveBeenCalledWith(
      'org-acme',
      'user-1',
    );
  });

  it('does not add a user whose address the issuer did not verify', async () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });

    await expect(
      joinOidcOrganization({ ...user, emailVerified: false }, callback),
    ).resolves.toBe(false);
    expect(db.member.create).not.toHaveBeenCalled();
  });

  it('leaves a sign-up through another door alone', async () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });

    await expect(joinOidcOrganization(user, passwordSignUp)).resolves.toBe(
      false,
    );
    expect(db.organization.findFirst).not.toHaveBeenCalled();
  });
});
