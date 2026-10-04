import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

const inviteMember = vi.hoisted(() => vi.fn());
const createMemberAccount = vi.hoisted(() => vi.fn());
const successToast = vi.hoisted(() => vi.fn());
const errorToast = vi.hoisted(() => vi.fn());

vi.mock('../../actions/members', () => ({ inviteMember, createMemberAccount }));
vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({ successToast, errorToast }),
}));

import { InviteMemberDialog } from '../InviteMemberDialog';
import messages from '@/app/messages/en.json';

const t = messages.organization.members;

const renderDialog = (onClose = vi.fn()) => {
  render(
    <NextIntlClientProvider messages={messages} locale="en">
      <InviteMemberDialog isOpen onClose={onClose} organizationId="org_1" />
    </NextIntlClientProvider>,
  );
  return onClose;
};

const switchToCreateMode = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('radio', { name: t['mode-create'] }));
};

describe('InviteMemberDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    inviteMember.mockResolvedValue({ success: true });
    createMemberAccount.mockResolvedValue({
      success: true,
      data: { email: 'ada@example.com', temporaryPassword: 'hunter2hunter2' },
    });
  });

  it('sends an invitation in the default mode', async () => {
    const user = userEvent.setup();
    const onClose = renderDialog();

    await user.type(screen.getByLabelText(t.email), 'ada@example.com');
    await user.click(
      screen.getByRole('button', { name: t['send-invitation'] }),
    );

    await waitFor(() =>
      expect(inviteMember).toHaveBeenCalledWith(
        'ada@example.com',
        'member',
        'org_1',
      ),
    );
    expect(createMemberAccount).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('says why an invitation was refused, in the reader’s language', async () => {
    // The action returns a code (#1092); this is the English the user reads.
    inviteMember.mockResolvedValue({ success: false, code: 'already-member' });
    const user = userEvent.setup();
    const onClose = renderDialog();

    await user.type(screen.getByLabelText(t.email), 'ada@example.com');
    await user.click(
      screen.getByRole('button', { name: t['send-invitation'] }),
    );

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith({
        message: messages.organization.errors['already-member'],
      }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('fills the limit into the message when a refusal carries it', async () => {
    createMemberAccount.mockResolvedValue({
      success: false,
      code: 'member-limit-reached',
      params: { limit: 5 },
    });
    const user = userEvent.setup();
    renderDialog();
    await switchToCreateMode(user);

    await user.type(screen.getByLabelText(t.name), 'Ada Lovelace');
    await user.type(screen.getByLabelText(t.email), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: t['create-account'] }));

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith({
        message:
          'The member limit (5) has been reached. Contact your administrator to increase it.',
      }),
    );
  });

  it('shows prose from the shared add-member check as it is', async () => {
    // The gate and the account command still return sentences of their own.
    inviteMember.mockResolvedValue({ success: false, error: 'Plan limit' });
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(t.email), 'ada@example.com');
    await user.click(
      screen.getByRole('button', { name: t['send-invitation'] }),
    );

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith({ message: 'Plan limit' }),
    );
  });

  it('asks for a name only when creating the account directly', async () => {
    const user = userEvent.setup();
    renderDialog();

    expect(screen.queryByLabelText(t.name)).not.toBeInTheDocument();
    await switchToCreateMode(user);
    expect(screen.getByLabelText(t.name)).toBeInTheDocument();
  });

  it('will not create an account without a name', async () => {
    const user = userEvent.setup();
    renderDialog();
    await switchToCreateMode(user);

    await user.type(screen.getByLabelText(t.email), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: t['create-account'] }));

    // The message is the English one: it used to be a Polish literal, which this
    // test then asserted, so an English user saw Polish and nothing failed.
    expect(
      await screen.findByText(t.validation['full-name-required']),
    ).toBeInTheDocument();
    expect(createMemberAccount).not.toHaveBeenCalled();
  });

  it('shows the temporary password and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const onClose = renderDialog();
    await switchToCreateMode(user);

    await user.type(screen.getByLabelText(t.name), 'Ada Lovelace');
    await user.type(screen.getByLabelText(t.email), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: t['create-account'] }));

    expect(await screen.findByTestId('temporary-password')).toHaveTextContent(
      'hunter2hunter2',
    );
    // Closing on success would destroy the only copy of the password.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reports a failure without showing credentials', async () => {
    createMemberAccount.mockResolvedValue({
      success: false,
      error: 'Brak uprawnień',
    });
    const user = userEvent.setup();
    renderDialog();
    await switchToCreateMode(user);

    await user.type(screen.getByLabelText(t.name), 'Ada Lovelace');
    await user.type(screen.getByLabelText(t.email), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: t['create-account'] }));

    await waitFor(() =>
      expect(errorToast).toHaveBeenCalledWith({ message: 'Brak uprawnień' }),
    );
    expect(screen.queryByTestId('temporary-password')).not.toBeInTheDocument();
  });
});
