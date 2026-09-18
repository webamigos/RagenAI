import { setPublicRuntimeConfigForTests } from '@/config/public-runtime-config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

const messages = {
  'sign-in': {
    'demo-account': 'Konto pokazowe',
    'demo-account-note': 'Wspólne konto demonstracyjne.',
    'demo-fill': 'Wypełnij',
    Password: 'Hasło',
  },
};

const ENV = { ...process.env };

/**
 * The credentials come from the configuration the server renders into the
 * document, so each case installs one and then imports fresh. It used to set
 * `process.env` and rely on Next inlining it at build time; that is exactly
 * what stopped, so that an image can be published once and configured per
 * install.
 */
async function renderNotice(
  env: Parameters<typeof setPublicRuntimeConfigForTests>[0],
) {
  vi.resetModules();
  setPublicRuntimeConfigForTests(env);

  const { DemoCredentialsNotice } = await import('../DemoCredentialsNotice');
  const onFill = vi.fn();

  render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <DemoCredentialsNotice onFill={onFill} />
    </NextIntlClientProvider>,
  );

  return { onFill };
}

beforeEach(() => {});

afterEach(() => {
  process.env = { ...ENV };
});

describe('DemoCredentialsNotice', () => {
  it('renders nothing on a deployment that set neither variable', async () => {
    // The case that matters for everyone who self-hosts: no box, no mention
    // of an account they do not have.
    await renderNotice({});

    expect(screen.queryByText('Konto pokazowe')).not.toBeInTheDocument();
  });

  it('renders nothing when only the address is set', async () => {
    // Half a credential is not an invitation. A partially configured
    // deployment must not advertise an account nobody can sign in to.
    await renderNotice({ demoEmail: 'demo@example.com' });

    expect(screen.queryByText('Konto pokazowe')).not.toBeInTheDocument();
  });

  it('renders nothing when only the password is set', async () => {
    await renderNotice({ demoPassword: 'secret' });

    expect(screen.queryByText('Konto pokazowe')).not.toBeInTheDocument();
  });

  it('renders nothing for a variable that is only whitespace', async () => {
    // An empty Railway variable arrives as '' or ' ', not as absent.
    await renderNotice({
      demoEmail: '  ',
      demoPassword: 'secret',
    });

    expect(screen.queryByText('Konto pokazowe')).not.toBeInTheDocument();
  });

  it('shows both values when the deployment offers an account', async () => {
    await renderNotice({
      demoEmail: 'demo@example.com',
      demoPassword: 'secret',
    });

    expect(screen.getByText('Konto pokazowe')).toBeInTheDocument();
    expect(screen.getByText('demo@example.com')).toBeInTheDocument();
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('warns that the data is shared', async () => {
    // Someone signing in with a public account should know before they
    // upload anything of their own.
    await renderNotice({
      demoEmail: 'demo@example.com',
      demoPassword: 'secret',
    });

    expect(
      screen.getByText('Wspólne konto demonstracyjne.'),
    ).toBeInTheDocument();
  });

  it('hands both values to the form when asked to fill it', async () => {
    const user = userEvent.setup();
    const { onFill } = await renderNotice({
      demoEmail: 'demo@example.com',
      demoPassword: 'secret',
    });

    await user.click(screen.getByRole('button', { name: 'Wypełnij' }));

    expect(onFill).toHaveBeenCalledWith({
      email: 'demo@example.com',
      password: 'secret',
    });
  });

  it('trims what the environment gives it', async () => {
    const user = userEvent.setup();
    const { onFill } = await renderNotice({
      demoEmail: ' demo@example.com ',
      demoPassword: ' secret ',
    });

    await user.click(screen.getByRole('button', { name: 'Wypełnij' }));

    expect(onFill).toHaveBeenCalledWith({
      email: 'demo@example.com',
      password: 'secret',
    });
  });
});
