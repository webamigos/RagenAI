import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

vi.mock('../../actions/user', () => ({ updateProfile: vi.fn() }));
vi.mock('@/app/hooks/use-better-auth', () => ({
  useSession: () => ({ refetch: vi.fn() }),
}));
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({ successToast: vi.fn(), errorToast: vi.fn() }),
}));

import { ProfileEditForm } from '../ProfileEditForm';
import messages from '@/app/messages/en.json';

const t = messages['user-profile'].profile;
const user = { name: 'Demo user', email: 'showcase@example.com' };

function renderForm(locked?: boolean) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ProfileEditForm user={user} locked={locked} />
    </NextIntlClientProvider>,
  );
}

describe('ProfileEditForm', () => {
  it('lets an ordinary account edit its name', () => {
    renderForm();

    expect(screen.getByLabelText(t.name)).toBeEnabled();
    expect(
      screen.queryByText(t['demo-account-locked']),
    ).not.toBeInTheDocument();
  });

  it('shows but does not allow editing the shared demo account name', () => {
    renderForm(true);

    const name = screen.getByLabelText(t.name);
    expect(name).toBeDisabled();
    expect(name).toHaveValue('Demo user');
    expect(screen.getByRole('button', { name: t.save })).toBeDisabled();
    expect(screen.getByText(t['demo-account-locked'])).toBeInTheDocument();
  });
});
