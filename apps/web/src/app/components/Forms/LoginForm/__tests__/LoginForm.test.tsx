import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

const signInEmail = vi.hoisted(() => vi.fn());
const signInSocial = vi.hoisted(() => vi.fn());
const finalizeOnboarding = vi.hoisted(() => vi.fn());

vi.mock('@/app/hooks/use-better-auth', () => ({
  signIn: { email: signInEmail, social: signInSocial },
}));

vi.mock(
  '@/features/onboarding/services/commands/finalize-onboarding-command',
  () => ({ finalizeOnboardingCommand: finalizeOnboarding }),
);

// Partial: next-intl's routing helpers pull `redirect` out of this module at
// import time, so replacing the whole module breaks the render.
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * A successful sign-in ends in a real page load — that is what `hardNavigate`
 * is for, and jsdom cannot do it. Unmocked, the assignment threw
 * "Not implemented: navigation" *after* the assertions had passed, so vitest
 * reported 2041 passing tests and still exited non-zero, turning
 * `npm run verify` red for reasons no failing test named.
 */
vi.mock('@/libs/navigation/hard-navigate', () => ({
  hardNavigate: vi.fn(),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { LoginForm } from '../LoginForm';

const messages = {
  'sign-in': {
    'sign-in': 'Sign in',
    Password: 'Password',
    'forgot-password': 'Forgot password?',
    'invalid-email': 'Email is invalid',
    'invalid-password': 'Password should have at least 8 characters',
    'email-not-verified': 'Your email address has not been verified.',
  },
};

const renderForm = (props?: { prefillEmail?: string }) =>
  render(
    <NextIntlClientProvider messages={messages} locale="en">
      <LoginForm {...props} />
    </NextIntlClientProvider>,
  );

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    signInEmail.mockResolvedValue({ error: null });
    finalizeOnboarding.mockResolvedValue(undefined);
  });

  it('signs in with the submitted credentials', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/email/i), 'ada@example.com');
    await user.type(screen.getByLabelText(/password/i), 'correct-horse');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    await waitFor(() =>
      expect(signInEmail).toHaveBeenCalledWith({
        email: 'ada@example.com',
        password: 'correct-horse',
      }),
    );
  });

  it('surfaces the unverified-email case with its own message', async () => {
    signInEmail.mockResolvedValue({ error: { message: 'Email not verified' } });
    const user = userEvent.setup();
    renderForm({ prefillEmail: 'ada@example.com' });

    await user.type(screen.getByLabelText(/password/i), 'correct-horse');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(
      await screen.findByText(/has not been verified/i),
    ).toBeInTheDocument();
    expect(finalizeOnboarding).not.toHaveBeenCalled();
  });

  // Social sign-in is an enterprise-edition feature. The open edition must not
  // start an external OAuth handshake from this form — asserting on signIn.social
  // rather than on the absence of a button, so re-adding one that calls it fails
  // here even if its label changes.
  it('offers no social sign-in path', async () => {
    const user = userEvent.setup();
    renderForm();

    for (const button of screen.getAllByRole('button')) {
      await user.click(button);
    }

    expect(signInSocial).not.toHaveBeenCalled();
    expect(screen.queryByText(/google/i)).not.toBeInTheDocument();
  });
});
