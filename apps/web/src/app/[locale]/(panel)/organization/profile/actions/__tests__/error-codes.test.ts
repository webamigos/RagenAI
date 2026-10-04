import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * What the organization-profile actions return when they refuse (#1092): a code,
 * never a sentence. The component says it in the reader's language, so an action
 * that returned prose again would put one language in front of everybody. Each
 * case also pins the thing the refusal protects — nothing is written.
 */

const mockGetActiveMember = vi.fn();
const mockGetSession = vi.fn();
const mockGetOrgId = vi.fn();

const mockUserFindUnique = vi.fn();
const mockMemberFindFirst = vi.fn();
const mockMemberDelete = vi.fn();
const mockMemberUpdate = vi.fn();
const mockInvitationFindUnique = vi.fn();
const mockInvitationDelete = vi.fn();
const mockOrganizationUpdate = vi.fn();

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers()),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...a: unknown[]) => mockGetSession(...a),
      signInMagicLink: vi.fn(),
    },
  },
}));
vi.mock('@/lib/auth-guards', () => ({
  getActiveMember: (...a: unknown[]) => mockGetActiveMember(...a),
  getSession: vi.fn(),
}));
vi.mock('@/lib/auth-access-control', () => ({
  isAppAdmin: () => false,
  canManageOrg: (role: string) => role === 'owner' || role === 'admin',
  canOwnOrg: (role: string) => role === 'owner',
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: (...a: unknown[]) => mockGetOrgId(...a),
}));
vi.mock(
  '@/features/subscriptions/services/commands/sync-seats-command',
  () => ({ syncSeatsToStripe: vi.fn() }),
);
vi.mock(
  '@/features/organizations/services/commands/create-member-account-command',
  () => ({ createMemberAccountCommand: vi.fn() }),
);
vi.mock(
  '@/features/organizations/services/queries/can-add-member-query',
  () => ({ canAddMemberQuery: vi.fn() }),
);
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    user: { findUnique: (...a: unknown[]) => mockUserFindUnique(...a) },
    member: {
      findFirst: (...a: unknown[]) => mockMemberFindFirst(...a),
      delete: (...a: unknown[]) => mockMemberDelete(...a),
      update: (...a: unknown[]) => mockMemberUpdate(...a),
    },
    invitation: {
      findUnique: (...a: unknown[]) => mockInvitationFindUnique(...a),
      delete: (...a: unknown[]) => mockInvitationDelete(...a),
    },
    organization: { update: (...a: unknown[]) => mockOrganizationUpdate(...a) },
  },
}));

import { removeMember, updateMemberRole } from '../members';
import { cancelInvitation } from '../invitations';
import { updateOrganization } from '../organization';

const ORG = 'org-1';
const admin = { id: 'self-member', role: 'admin' };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActiveMember.mockResolvedValue(admin);
  mockGetSession.mockResolvedValue({ user: { id: 'self-user' } });
  mockGetOrgId.mockResolvedValue(ORG);
});

describe('removeMember', () => {
  it('refuses a caller who cannot manage the organization', async () => {
    mockGetActiveMember.mockResolvedValue({ id: 'm', role: 'member' });

    expect(await removeMember('m-2', ORG)).toEqual({
      success: false,
      code: 'no-permission-remove-member',
    });
    expect(mockMemberDelete).not.toHaveBeenCalled();
  });

  it('refuses a member that does not exist', async () => {
    mockMemberFindFirst.mockResolvedValue(null);

    expect(await removeMember('m-2', ORG)).toEqual({
      success: false,
      code: 'member-not-found',
    });
  });

  it('refuses to remove yourself', async () => {
    mockMemberFindFirst.mockResolvedValue({
      id: 'm-2',
      userId: 'self-user',
      role: 'member',
    });

    expect(await removeMember('m-2', ORG)).toEqual({
      success: false,
      code: 'cannot-remove-self',
    });
    expect(mockMemberDelete).not.toHaveBeenCalled();
  });

  it('refuses to remove the owner', async () => {
    mockMemberFindFirst.mockResolvedValue({
      id: 'm-2',
      userId: 'someone-else',
      role: 'owner',
    });

    expect(await removeMember('m-2', ORG)).toEqual({
      success: false,
      code: 'cannot-remove-owner',
    });
    expect(mockMemberDelete).not.toHaveBeenCalled();
  });

  it('reports an unexpected failure as a code, and not its message', async () => {
    mockMemberFindFirst.mockRejectedValue(new Error('connection reset'));

    expect(await removeMember('m-2', ORG)).toEqual({
      success: false,
      code: 'remove-member-failed',
    });
  });

  it('removes a member it is allowed to', async () => {
    mockMemberFindFirst.mockResolvedValue({
      id: 'm-2',
      userId: 'someone-else',
      role: 'member',
    });

    expect(await removeMember('m-2', ORG)).toEqual({ success: true });
    expect(mockMemberDelete).toHaveBeenCalledWith({ where: { id: 'm-2' } });
  });
});

describe('updateMemberRole', () => {
  it('refuses a caller who cannot manage the organization', async () => {
    mockGetActiveMember.mockResolvedValue({ id: 'm', role: 'member' });

    expect(await updateMemberRole('m-2', 'admin', ORG)).toEqual({
      success: false,
      code: 'no-permission-change-role',
    });
    expect(mockMemberUpdate).not.toHaveBeenCalled();
  });

  it('refuses a member that does not exist', async () => {
    mockMemberFindFirst.mockResolvedValue(null);

    expect(await updateMemberRole('m-2', 'admin', ORG)).toEqual({
      success: false,
      code: 'member-not-found',
    });
  });

  it("refuses to change the owner's role", async () => {
    mockMemberFindFirst.mockResolvedValue({ id: 'm-2', role: 'owner' });

    expect(await updateMemberRole('m-2', 'member', ORG)).toEqual({
      success: false,
      code: 'cannot-change-owner-role',
    });
    expect(mockMemberUpdate).not.toHaveBeenCalled();
  });
});

describe('cancelInvitation', () => {
  it('refuses an invitation that does not exist', async () => {
    mockInvitationFindUnique.mockResolvedValue(null);

    expect(await cancelInvitation('inv-1')).toEqual({
      success: false,
      code: 'invitation-not-found',
    });
  });

  it('refuses a caller who cannot manage the organization', async () => {
    mockInvitationFindUnique.mockResolvedValue({
      id: 'inv-1',
      organizationId: ORG,
    });
    mockGetActiveMember.mockResolvedValue({ id: 'm', role: 'member' });

    expect(await cancelInvitation('inv-1')).toEqual({
      success: false,
      code: 'no-permission-cancel-invitation',
    });
    expect(mockInvitationDelete).not.toHaveBeenCalled();
  });
});

describe('updateOrganization', () => {
  it('refuses invalid input before it looks at who is asking', async () => {
    expect(await updateOrganization({ name: '' })).toEqual({
      success: false,
      code: 'invalid-data',
    });
    expect(mockGetOrgId).not.toHaveBeenCalled();
  });

  it('refuses a caller who cannot manage the organization', async () => {
    mockGetActiveMember.mockResolvedValue({ id: 'm', role: 'member' });

    expect(await updateOrganization({ name: 'Acme' })).toEqual({
      success: false,
      code: 'no-permission-edit-organization',
    });
    expect(mockOrganizationUpdate).not.toHaveBeenCalled();
  });

  it('reports an unexpected failure as a code', async () => {
    mockOrganizationUpdate.mockRejectedValue(new Error('deadlock'));

    expect(await updateOrganization({ name: 'Acme' })).toEqual({
      success: false,
      code: 'update-organization-failed',
    });
  });
});
