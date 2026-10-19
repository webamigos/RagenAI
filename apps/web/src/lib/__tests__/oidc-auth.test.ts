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

const getOAuthState = vi.hoisted(() => vi.fn());
vi.mock('better-auth/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('better-auth/api')>()),
  getOAuthState,
}));

import { APIError } from 'better-auth/api';

import {
  joinOidcOrganization,
  oidcPlugins,
  oidcSignUpAdmitted,
  oidcSignUpRefusal,
  refusalError,
  refusalRedirect,
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

  it('adds the generic OAuth plugin, and the redirect for its refusals, when it is', () => {
    configure();
    expect(oidcPlugins().map((plugin) => plugin.id)).toEqual([
      'generic-oauth',
      'oidc-callback-refusals',
    ]);
  });

  it('runs the refusal redirect on the OIDC callback only', () => {
    configure();
    const [, refusals] = oidcPlugins();
    const [hook] = refusals.hooks!.after!;
    expect(hook.matcher(callback as never)).toBe(true);
    expect(hook.matcher(passwordSignUp as never)).toBe(false);
    expect(
      hook.matcher({
        path: '/callback/:id',
        params: { id: 'google' },
      } as never),
    ).toBe(false);
  });
});

describe('the profile gate in mapProfileToUser', () => {
  function mapProfile(profile: Record<string, unknown>) {
    const [generic] = oidcPlugins() as unknown as [
      {
        options: {
          config: [
            { mapProfileToUser: (profile: Record<string, unknown>) => unknown },
          ];
        };
      },
    ];
    return generic.options.config[0].mapProfileToUser(profile);
  }

  function refusalCode(profile: Record<string, unknown>): string | undefined {
    try {
      mapProfile(profile);
    } catch (error) {
      return (error as APIError).body?.code;
    }
    return undefined;
  }

  it('maps an allowed, verified profile', () => {
    configure();
    expect(mapProfile({ email: 'Jan@Acme.pl', emailVerified: true })).toEqual({
      email: 'jan@acme.pl',
      emailVerified: true,
    });
  });

  it('refuses an address outside the allowed domains, with a code', () => {
    configure();
    expect(refusalCode({ email: 'eve@gmail.com', emailVerified: true })).toBe(
      'oidc_domain_not_allowed',
    );
  });

  it('refuses a profile with no address', () => {
    configure();
    expect(refusalCode({ emailVerified: true })).toBe('email_not_found');
  });

  it('refuses a Google account outside the allowed Workspace, by its hd claim', () => {
    configure({ OIDC_ISSUER: 'https://accounts.google.com' });
    expect(
      refusalCode({ email: 'jan@acme.pl', emailVerified: true, hd: 'evil.pl' }),
    ).toBe('oidc_hosted_domain_mismatch');
    expect(refusalCode({ email: 'jan@acme.pl', emailVerified: true })).toBe(
      'oidc_hosted_domain_mismatch',
    );
    expect(
      refusalCode({ email: 'jan@acme.pl', emailVerified: true, hd: 'acme.pl' }),
    ).toBeUndefined();
  });
});

describe('refusalError', () => {
  it('is a 403 APIError carrying the code the sign-in page reads', () => {
    const error = refusalError('oidc_email_not_verified');
    expect(error).toBeInstanceOf(APIError);
    expect(error.statusCode).toBe(403);
    expect(error.body).toMatchObject({
      code: 'oidc_email_not_verified',
      message: expect.any(String),
    });
  });

  it('keeps the registration-closed message the password form shows', () => {
    expect(refusalError('registration_disabled').body?.message).toBe(
      'Registration is disabled on this installation. Ask an administrator for an invitation.',
    );
  });
});

describe('refusalRedirect', () => {
  it('leaves a successful callback alone', async () => {
    await expect(refusalRedirect({ ok: true })).resolves.toBeNull();
    await expect(refusalRedirect(undefined)).resolves.toBeNull();
  });

  it("leaves Better Auth's own redirects alone", async () => {
    // Success and its handled errors alike are a 302 APIError.
    await expect(
      refusalRedirect(new APIError('FOUND', undefined, { location: '/x' })),
    ).resolves.toBeNull();
  });

  it('sends a refusal to the error URL the sign-in page passed, with its code', async () => {
    getOAuthState.mockResolvedValue({ errorURL: '/pl/sign-in' });
    await expect(
      refusalRedirect(refusalError('oidc_domain_not_allowed')),
    ).resolves.toBe('/pl/sign-in?error=oidc_domain_not_allowed');
  });

  it('appends to an error URL that already has a query', async () => {
    getOAuthState.mockResolvedValue({
      errorURL: 'http://localhost:3000/en/sign-in?invitationId=1',
    });
    await expect(
      refusalRedirect(refusalError('oidc_email_not_verified')),
    ).resolves.toBe(
      'http://localhost:3000/en/sign-in?invitationId=1&error=oidc_email_not_verified',
    );
  });

  it('falls back to the sign-in page when there is no state to read', async () => {
    getOAuthState.mockRejectedValue(new Error('no request state'));
    await expect(
      refusalRedirect(refusalError('oidc_domain_not_allowed')),
    ).resolves.toBe('/sign-in?error=oidc_domain_not_allowed');
  });

  it('turns an error with no code into the general one', async () => {
    // The JSON page this exists to prevent: any APIError, not only ours.
    getOAuthState.mockResolvedValue(null);
    await expect(
      refusalRedirect(new APIError('INTERNAL_SERVER_ERROR', { message: 'x' })),
    ).resolves.toBe('/sign-in?error=sso_failed');
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

describe('oidcSignUpRefusal', () => {
  beforeEach(() => {
    db.organization.findFirst.mockResolvedValue({ id: 'org-acme' });
  });

  it('is null for a sign-up it admits', async () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });
    await expect(oidcSignUpRefusal(verified, callback)).resolves.toBeNull();
  });

  it('says registration is closed for any other door', async () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });
    await expect(oidcSignUpRefusal(verified, passwordSignUp)).resolves.toBe(
      'registration_disabled',
    );
  });

  it('says registration is closed when company sign-in is off', async () => {
    await expect(oidcSignUpRefusal(verified, callback)).resolves.toBe(
      'registration_disabled',
    );
  });

  it('names an address outside the allowed domains', async () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });
    await expect(
      oidcSignUpRefusal(
        { email: 'eve@gmail.com', emailVerified: true },
        callback,
      ),
    ).resolves.toBe('oidc_domain_not_allowed');
  });

  it('names an address the issuer did not verify', async () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });
    await expect(
      oidcSignUpRefusal({ ...verified, emailVerified: false }, callback),
    ).resolves.toBe('oidc_email_not_verified');
  });

  it('names a missing join organization — the Entra case of 2026-10-19', async () => {
    configure();
    await expect(oidcSignUpRefusal(verified, callback)).resolves.toBe(
      'oidc_join_organization_unset',
    );
  });

  it('names a join organization that does not exist', async () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'missing' });
    db.organization.findFirst.mockResolvedValue(null);
    await expect(oidcSignUpRefusal(verified, callback)).resolves.toBe(
      'oidc_join_organization_not_found',
    );
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
