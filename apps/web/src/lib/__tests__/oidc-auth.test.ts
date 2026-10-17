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

describe('oidcSignUpAdmitted', () => {
  it('admits an allowed address arriving through the OIDC callback, into a configured organization', () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });
    expect(oidcSignUpAdmitted('jan@acme.pl', callback)).toBe(true);
  });

  it('does not admit a password sign-up for the same domain', () => {
    // The callback path is what makes it a company sign-in. Without this, an
    // unverified email-and-password sign-up at the company's domain would
    // walk past closed registration into the company's organization.
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });
    expect(oidcSignUpAdmitted('jan@acme.pl', passwordSignUp)).toBe(false);
  });

  it('does not admit without an organization to join', () => {
    configure();
    expect(oidcSignUpAdmitted('jan@acme.pl', callback)).toBe(false);
  });

  it('does not admit an address outside the allowed domains', () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'acme' });
    expect(oidcSignUpAdmitted('eve@gmail.com', callback)).toBe(false);
  });
});

describe('joinOidcOrganization', () => {
  const user = { id: 'user-1', email: 'jan@acme.pl' };

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

  it('falls back to a personal organization when the named one does not exist', async () => {
    configure({ OIDC_JOIN_ORGANIZATION: 'missing' });
    db.organization.findFirst.mockResolvedValue(null);

    await expect(joinOidcOrganization(user, callback)).resolves.toBe(false);
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
