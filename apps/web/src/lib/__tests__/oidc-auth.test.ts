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
