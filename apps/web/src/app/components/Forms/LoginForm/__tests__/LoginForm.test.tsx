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
const searchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useSearchParams: () => searchParams.current,
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
    'sso-sign-in': 'Sign in with {name}',
    'sso-or': 'or',
    'sso-failed': 'Company sign-in failed.',
    'sso-error-domain': 'Outside the accepted domains.',
    'sso-error-join-organization-unset': 'Cannot create new accounts.',
  },
};

const renderForm = (props?: {
  prefillEmail?: string;
  sso?: { displayName: string };
}) =>
  render(
    <NextIntlClientProvider messages={messages} locale="en">
      <LoginForm {...props} />
    </NextIntlClientProvider>,
  );

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    searchParams.current = new URLSearchParams();
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

  // Without company sign-in configured, this form must not start an external
  // OAuth handshake — asserting on signIn.social rather than on the absence of
  // a button, so one that calls it unconfigured fails here even if its label
  // changes.
  it('offers no social sign-in path when company sign-in is off', async () => {
    const user = userEvent.setup();
    renderForm();

    for (const button of screen.getAllByRole('button')) {
      await user.click(button);
    }

    expect(signInSocial).not.toHaveBeenCalled();
    expect(screen.queryByText(/google/i)).not.toBeInTheDocument();
  });

  describe('company sign-in (OIDC)', () => {
    it('offers it under the configured name and starts the OIDC handshake', async () => {
      signInSocial.mockResolvedValue({ data: { url: 'https://idp' } });
      const user = userEvent.setup();
      renderForm({ sso: { displayName: 'Microsoft' } });

      await user.click(
        screen.getByRole('button', { name: 'Sign in with Microsoft' }),
      );

      expect(signInSocial).toHaveBeenCalledWith({
        provider: 'oidc',
        callbackURL: '/en/new',
        errorCallbackURL: '/en/sign-in',
      });
      expect(signInEmail).not.toHaveBeenCalled();
    });

    it.each([
      ['oidc_domain_not_allowed', 'Outside the accepted domains.'],
      ['oidc_join_organization_unset', 'Cannot create new accounts.'],
    ])(
      'says which refusal it was when the callback sent the user back with %s',
      (code, message) => {
        searchParams.current = new URLSearchParams(`error=${code}`);
        renderForm({ sso: { displayName: 'Microsoft' } });

        const alert = screen.getByRole('alert');
        expect(alert).toHaveTextContent(message);
        expect(alert).toHaveAttribute('data-error', code);
      },
    );

    it('falls back to the general sentence for a code it does not know', () => {
      searchParams.current = new URLSearchParams('error=state_mismatch');
      renderForm({ sso: { displayName: 'Microsoft' } });

      expect(screen.getByRole('alert')).toHaveTextContent(
        'Company sign-in failed.',
      );
    });

    it('ignores an error parameter when company sign-in is off', () => {
      searchParams.current = new URLSearchParams('error=email_not_found');
      renderForm();

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });
});
