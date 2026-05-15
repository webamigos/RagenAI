import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetSession = vi.fn();
const mockGetInvitationDetails = vi.fn();
const mockUserFindUnique = vi.fn();
const mockRedirect = vi.fn();

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers()),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/app/components/Forms/AcceptInvitationForm', () => ({
  AcceptInvitationForm: () => null,
}));

vi.mock('next-intl/server', () => ({
  setRequestLocale: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: { getSession: (...args: unknown[]) => mockGetSession(...args) },
  },
}));

vi.mock('@/i18n/routing', () => ({
  redirect: (input: { href: string; locale: string }) => {
    mockRedirect(input);
    // Short-circuit page execution the same way next/navigation's redirect does.
    throw new Error('__NEXT_REDIRECT__');
  },
}));

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
  },
}));

vi.mock('../actions', () => ({
  getInvitationDetails: (...args: unknown[]) =>
    mockGetInvitationDetails(...args),
}));

import AcceptInvitationPage from '../page';

async function runPage(token?: string) {
  try {
    await AcceptInvitationPage({
      params: Promise.resolve({ locale: 'pl' }),
      searchParams: Promise.resolve(token ? { token } : {}),
    });
  } catch (err) {
    if (err instanceof Error && err.message === '__NEXT_REDIRECT__') {
      return;
    }
    throw err;
  }
}

describe('AcceptInvitationPage gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSession.mockResolvedValue(null);
  });

  it('routes existing-user invitee to sign-in with invitationId', async () => {
    mockGetInvitationDetails.mockResolvedValue({
      success: true,
      invitation: { email: 'existing@example.com', organizationName: 'Acme' },
    });
    mockUserFindUnique.mockResolvedValue({ id: 'user-1' });

    await runPage('inv_abc');

    expect(mockRedirect).toHaveBeenCalledWith({
      href: '/sign-in?invitationId=inv_abc',
      locale: 'pl',
    });
  });

  it('routes new invitee (no user yet) to sign-up with invitationId', async () => {
    mockGetInvitationDetails.mockResolvedValue({
      success: true,
      invitation: { email: 'fresh@example.com', organizationName: 'Acme' },
    });
    mockUserFindUnique.mockResolvedValue(null);

    await runPage('inv_xyz');

    expect(mockRedirect).toHaveBeenCalledWith({
      href: '/sign-up?invitationId=inv_xyz',
      locale: 'pl',
    });
  });

  it('falls back to sign-in when token is invalid / not found', async () => {
    mockGetInvitationDetails.mockResolvedValue({
      success: false,
      error: 'not found',
    });

    await runPage('inv_missing');

    expect(mockRedirect).toHaveBeenCalledWith({
      href: '/sign-in?invitationId=inv_missing',
      locale: 'pl',
    });
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it('redirects to bare /sign-in when no token is supplied', async () => {
    await runPage();

    expect(mockRedirect).toHaveBeenCalledWith({
      href: '/sign-in',
      locale: 'pl',
    });
    expect(mockGetInvitationDetails).not.toHaveBeenCalled();
  });

  it('skips redirect when the visitor is already authenticated', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'u' } });

    await runPage('inv_abc');

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('encodes the token in the redirect URL', async () => {
    mockGetInvitationDetails.mockResolvedValue({
      success: true,
      invitation: { email: 'fresh@example.com', organizationName: 'Acme' },
    });
    mockUserFindUnique.mockResolvedValue(null);

    await runPage('a/b c');

    expect(mockRedirect).toHaveBeenCalledWith({
      href: '/sign-up?invitationId=a%2Fb%20c',
      locale: 'pl',
    });
  });
});
