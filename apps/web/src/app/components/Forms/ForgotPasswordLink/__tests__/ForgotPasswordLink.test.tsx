import { setPublicRuntimeConfigForTests } from '@/config/public-runtime-config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const ENV = { ...process.env };

/**
 * The credentials come from the configuration the server renders into the
 * document, so each case installs one and then imports fresh. It used to set
 * `process.env` and rely on Next inlining it at build time; that is exactly
 * what stopped, so that an image can be published once and configured per
 * install.
 */
async function renderLink(
  env: Parameters<typeof setPublicRuntimeConfigForTests>[0],
) {
  vi.resetModules();
  setPublicRuntimeConfigForTests(env);

  const { ForgotPasswordLink } = await import('../ForgotPasswordLink');

  render(<ForgotPasswordLink label="Nie pamiętasz hasła?" />);
}

beforeEach(() => {});

afterEach(() => {
  process.env = { ...ENV };
});

describe('ForgotPasswordLink', () => {
  it('offers password recovery on an ordinary deployment', async () => {
    await renderLink({});

    expect(
      screen.getByRole('link', { name: 'Nie pamiętasz hasła?' }),
    ).toHaveAttribute('href', '/forgot-password');
  });

  it('disappears once a deployment publishes a shared demo account', async () => {
    await renderLink({
      demoEmail: 'demo@example.com',
      demoPassword: 'secret',
    });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('stays for a half-configured deployment, which publishes nothing', async () => {
    // Same gate as the notice: one variable alone is not an offer of a demo
    // account, so nothing about the screen changes.
    await renderLink({ demoEmail: 'demo@example.com' });

    expect(screen.getByRole('link')).toBeInTheDocument();
  });
});
