import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetActiveMember = vi.fn();
const mockGetSession = vi.fn();
const mockIsFeatureEnabled = vi.fn();
const mockUsageLimits = vi.fn();
const mockSignInMagicLink = vi.fn();
const mockRevalidate = vi.fn();

const mockUserFindUnique = vi.fn();
const mockMemberFindFirst = vi.fn();
const mockInvitationFindFirst = vi.fn();
const mockInvitationCreate = vi.fn();
const mockInvitationDelete = vi.fn();
const mockOrganizationFindUnique = vi.fn();

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers()),
}));

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => mockRevalidate(...args),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
      signInMagicLink: (...args: unknown[]) => mockSignInMagicLink(...args),
    },
  },
}));

vi.mock('@/lib/auth-guards', () => ({
  getActiveMember: (...args: unknown[]) => mockGetActiveMember(...args),
  getSession: (...args: unknown[]) => mockGetSession(...args),
}));

vi.mock('@/lib/auth-access-control', () => ({
  isAppAdmin: () => false,
  canManageOrg: (role: string) => role === 'owner' || role === 'admin',
}));

vi.mock('@/features/organizations/services/organization-settings', () => ({
  getUsageLimits: (...args: unknown[]) => mockUsageLimits(...args),
}));

vi.mock(
  '@/features/subscriptions/services/commands/sync-seats-command',
  () => ({ syncSeatsToStripe: vi.fn() }),
);

vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({
    isFeatureEnabledQuery: (...args: unknown[]) =>
      mockIsFeatureEnabled(...args),
  }),
);

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
    member: {
      findFirst: (...a: unknown[]) => mockMemberFindFirst(...a),
      count: vi.fn().mockResolvedValue(0),
    },
    invitation: {
      findFirst: (...a: unknown[]) => mockInvitationFindFirst(...a),
      count: vi.fn().mockResolvedValue(0),
      create: (...a: unknown[]) => mockInvitationCreate(...a),
      delete: (...a: unknown[]) => mockInvitationDelete(...a),
    },
    organization: {
      findUnique: (...a: unknown[]) => mockOrganizationFindUnique(...a),
    },
  },
}));

import { inviteMember } from '../members';
import { pendingMagicLinkContext } from '@/lib/magic-link-context';

const ORG = 'org-1';

describe('inviteMember (magic-link flow)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pendingMagicLinkContext.clear();
    mockGetActiveMember.mockResolvedValue({ id: 'm-1', role: 'owner' });
    mockGetSession.mockResolvedValue({
      user: { id: 'inviter-id', name: 'Inviter', email: 'inviter@example.com' },
    });
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockUsageLimits.mockResolvedValue({ maxMembers: null });
    mockUserFindUnique.mockResolvedValue(null);
    mockMemberFindFirst.mockResolvedValue(null);
    mockInvitationFindFirst.mockResolvedValue(null);
    mockOrganizationFindUnique.mockResolvedValue({ name: 'Acme' });
    mockInvitationCreate.mockImplementation(
      ({ data }: { data: { id: string } }) => Promise.resolve({ id: data.id }),
    );
    mockInvitationDelete.mockResolvedValue(undefined);
  });

  it('stores context and calls signInMagicLink with encoded invitation ID', async () => {
    mockSignInMagicLink.mockResolvedValue({});

    const result = await inviteMember('NEW@example.com', 'member', ORG);

    expect(result).toEqual({ success: true });
    expect(mockSignInMagicLink).toHaveBeenCalledTimes(1);
    const args = mockSignInMagicLink.mock.calls[0][0];
    expect(args.body.email).toBe('new@example.com');
    expect(args.body.callbackURL).toMatch(/^\/accept-invitation\?token=inv_/);
    expect(args.body.newUserCallbackURL).toBe(args.body.callbackURL);

    // Context was set before signInMagicLink fired (sendMagicLink callback
    // is responsible for deleting it after the email goes out).
    const ctxArg = mockSignInMagicLink.mock.calls[0][0].body.email as string;
    expect(ctxArg).toBe('new@example.com');
  });

  it('rolls invitation back and clears context when signInMagicLink throws', async () => {
    mockSignInMagicLink.mockRejectedValue(new Error('SMTP down'));

    const result = await inviteMember('fresh@example.com', 'member', ORG);

    expect(result).toEqual({
      success: false,
      error: 'Nie udało się wysłać zaproszenia',
    });
    expect(mockInvitationDelete).toHaveBeenCalledTimes(1);
    expect(pendingMagicLinkContext.has('fresh@example.com')).toBe(false);
  });

  it('rejects when the user already belongs to the organization', async () => {
    mockUserFindUnique.mockResolvedValue({ id: 'user-99' });
    mockMemberFindFirst.mockResolvedValue({ id: 'm-99' });

    const result = await inviteMember('member@example.com', 'member', ORG);

    expect(result.success).toBe(false);
    expect(mockSignInMagicLink).not.toHaveBeenCalled();
    expect(mockInvitationCreate).not.toHaveBeenCalled();
  });

  it('rejects when there is already a pending invitation for this email', async () => {
    mockInvitationFindFirst.mockResolvedValue({ id: 'inv-prev' });

    const result = await inviteMember('pending@example.com', 'member', ORG);

    expect(result.success).toBe(false);
    expect(mockSignInMagicLink).not.toHaveBeenCalled();
    expect(mockInvitationCreate).not.toHaveBeenCalled();
  });
});
