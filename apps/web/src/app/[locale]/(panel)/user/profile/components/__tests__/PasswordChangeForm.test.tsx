import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

vi.mock('../../actions/user', () => ({ changePassword: vi.fn() }));
vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({ successToast: vi.fn(), errorToast: vi.fn() }),
}));

import { PasswordChangeForm } from '../PasswordChangeForm';
import messages from '@/app/messages/en.json';

const t = messages['user-profile'].password;

function renderForm(locked?: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <PasswordChangeForm locked={locked} />
    </NextIntlClientProvider>,
  );
}

describe('PasswordChangeForm', () => {
  it('enables the submit once something is typed', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(t.current), 'old-password');

    expect(screen.getByRole('button', { name: t.change })).toBeEnabled();
    expect(
      screen.queryByText(t['demo-account-locked']),
    ).not.toBeInTheDocument();
  });

  it('disables every field and the submit for the shared demo account', () => {
    renderForm(true);

    expect(screen.getByLabelText(t.current)).toBeDisabled();
    expect(screen.getByLabelText(t.new)).toBeDisabled();
    expect(screen.getByLabelText(t.confirm)).toBeDisabled();
    expect(screen.getByRole('button', { name: t.change })).toBeDisabled();
    expect(screen.getByText(t['demo-account-locked'])).toBeInTheDocument();
  });
});
