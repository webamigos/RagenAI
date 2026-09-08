import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

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

import { OrganizationNav } from '../OrganizationNav';
import messages from '@/app/messages/en.json';

const t = messages['organization-page'].nav;

describe('OrganizationNav', () => {
  it('does not list Subscription, even with Stripe configured', () => {
    // Plans are not sold from inside the panel; the entry only led to a page
    // nobody could act on. The route itself stays for the Stripe return flows.
    vi.stubEnv('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_x');

    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <OrganizationNav />
      </NextIntlClientProvider>,
    );

    expect(
      screen.queryByRole('link', { name: t.subscription }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: t.connectors })).toHaveAttribute(
      'href',
      '/organization/connectors',
    );

    vi.unstubAllEnvs();
  });
});
