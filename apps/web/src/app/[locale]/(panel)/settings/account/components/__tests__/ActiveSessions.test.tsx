import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

const listSessions = vi.hoisted(() => vi.fn());
const getSession = vi.hoisted(() => vi.fn());
const revokeSessions = vi.hoisted(() => vi.fn());
const revokeSession = vi.hoisted(() => vi.fn());

vi.mock('@/app/hooks/use-better-auth', () => ({
  authClient: { listSessions, getSession, revokeSessions, revokeSession },
}));
vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({ successToast: vi.fn(), errorToast: vi.fn() }),
}));

import { ActiveSessions } from '../ActiveSessions';
import messages from '@/app/messages/en.json';

const t = messages['user-profile'].sessions;

const sessions = [
  {
    id: 's1',
    token: 'current',
    userAgent: 'Chrome/1 Macintosh',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 's2',
    token: 'other',
    userAgent: 'Firefox/1 Windows',
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function renderSessions(locked?: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ActiveSessions locked={locked} />
    </NextIntlClientProvider>,
  );
}

describe('ActiveSessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listSessions.mockResolvedValue({ data: sessions });
    getSession.mockResolvedValue({ data: { session: { token: 'current' } } });
  });

  it('offers to log the other devices out for an ordinary account', async () => {
    renderSessions();

    expect(
      await screen.findByRole('button', { name: t['logout-all'] }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: t.revoke })).toBeEnabled();
  });

  it('keeps the list visible but greys out every revoke for the shared demo account', async () => {
    // The other sessions are other prospects. Logging them out is the one
    // thing this page must not let a visitor do.
    renderSessions(true);

    const logoutAll = await screen.findByRole('button', {
      name: t['logout-all'],
    });
    expect(logoutAll).toBeDisabled();
    expect(logoutAll).toHaveAttribute('title', t['demo-account-locked']);
    expect(screen.getByRole('button', { name: t.revoke })).toBeDisabled();
    expect(screen.getByText(t['demo-account-locked'])).toBeInTheDocument();
    expect(screen.getByText(/Firefox/)).toBeInTheDocument();
  });
});
