import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import messages from '@/app/messages/en.json';

vi.mock('@/i18n/routing', () => ({
  usePathname: () => '/organization/profile',
  Link: ({
    children,
    href,
    ...props
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const t = messages['organization-page'].nav;

/**
 * `OrganizationNav` reads `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` at **module
 * scope** — `const isStripeEnabled = !!process.env…` — which Next inlines at
 * build time. A static import at the top of this file would evaluate that
 * before any `vi.stubEnv` in a test body, so the "with Stripe configured"
 * case would run with Stripe unconfigured and pass no matter what the
 * component did. Each case therefore sets the environment first and imports
 * fresh, the same shape `DemoCredentialsNotice.test.tsx` uses.
 */
async function renderNav(stripeKey: string | undefined) {
  vi.resetModules();
  if (stripeKey === undefined) {
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', '');
  } else {
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', stripeKey);
  }

  const { OrganizationNav } = await import('../OrganizationNav');

  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <OrganizationNav />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('OrganizationNav', () => {
  it('does not list Subscription when Stripe is configured', async () => {
    // The case that needs the fresh import: with the key set, the old
    // component built the entry. Plans are not sold from inside the panel,
    // so the entry only led to a page nobody could act on. The route itself
    // stays, for the Stripe return flows.
    await renderNav('pk_test_x');

    expect(
      screen.queryByRole('link', { name: t.subscription }),
    ).not.toBeInTheDocument();
  });

  it('does not list Subscription when Stripe is unconfigured either', async () => {
    await renderNav(undefined);

    expect(
      screen.queryByRole('link', { name: t.subscription }),
    ).not.toBeInTheDocument();
  });

  it('still lists the entries around it', async () => {
    // Guard on the guard: an empty render would satisfy every assertion above.
    await renderNav('pk_test_x');

    expect(screen.getByRole('link', { name: t.connectors })).toHaveAttribute(
      'href',
      '/organization/connectors',
    );
    expect(screen.getByRole('link', { name: t.chatbots })).toHaveAttribute(
      'href',
      '/organization/chatbots',
    );
  });
});
