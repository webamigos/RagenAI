import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const ENV = { ...process.env };

/**
 * The credentials are read at module load, so each case sets the environment
 * and then imports fresh — the same thing Next does at build time.
 */
async function renderLink(env: Record<string, string | undefined>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  const { ForgotPasswordLink } = await import('../ForgotPasswordLink');

  render(<ForgotPasswordLink label="Nie pamiętasz hasła?" />);
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_DEMO_EMAIL;
  delete process.env.NEXT_PUBLIC_DEMO_PASSWORD;
});

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
      NEXT_PUBLIC_DEMO_EMAIL: 'demo@example.com',
      NEXT_PUBLIC_DEMO_PASSWORD: 'secret',
    });

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('stays for a half-configured deployment, which publishes nothing', async () => {
    // Same gate as the notice: one variable alone is not an offer of a demo
    // account, so nothing about the screen changes.
    await renderLink({ NEXT_PUBLIC_DEMO_EMAIL: 'demo@example.com' });

    expect(screen.getByRole('link')).toBeInTheDocument();
  });
});
