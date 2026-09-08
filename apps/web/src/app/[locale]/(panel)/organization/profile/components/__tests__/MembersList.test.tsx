import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

vi.mock('../../actions/members', () => ({
  removeMember: vi.fn(),
  updateMemberRole: vi.fn(),
}));
vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({ successToast: vi.fn(), errorToast: vi.fn() }),
}));
vi.mock('../InviteMemberDialog', () => ({ InviteMemberDialog: () => null }));

import { MembersList } from '../MembersList';
import messages from '@/app/messages/en.json';

const t = messages.organization.members;

function renderList(props: { allowInvite: boolean; demoAccount?: boolean }) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <MembersList
        members={[]}
        organizationId="org-1"
        currentUserRole="admin"
        currentUserEmail="admin@example.com"
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

describe('MembersList — why inviting is off', () => {
  it('shows the invite button and no notice when inviting is allowed', () => {
    renderList({ allowInvite: true });

    expect(
      screen.getByRole('button', { name: t['invite-member'] }),
    ).toBeInTheDocument();
    expect(screen.queryByText(t['invite-unavailable-plan'])).toBeNull();
    expect(screen.queryByText(t['invite-unavailable-demo'])).toBeNull();
  });

  it('blames the plan for an ordinary organization', () => {
    renderList({ allowInvite: false });

    expect(screen.getByText(t['invite-unavailable-plan'])).toBeInTheDocument();
    expect(screen.queryByText(t['invite-unavailable-demo'])).toBeNull();
  });

  it('says "demo" for the shared demo account, where there is no plan to change', () => {
    renderList({ allowInvite: false, demoAccount: true });

    expect(screen.getByText(t['invite-unavailable-demo'])).toBeInTheDocument();
    expect(screen.queryByText(t['invite-unavailable-plan'])).toBeNull();
  });
});
