import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

vi.mock('@/i18n/routing', () => ({
  Link: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    className?: string;
    title?: string;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CreditsChip } from '../CreditsChip';

const messages = {
  subscription: {
    credits: {
      balance: 'Available credits',
      description: 'Credits are used for lead enrichment and AI scoring.',
    },
  },
};

function renderChip(balance: number) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CreditsChip balance={balance} />
    </NextIntlClientProvider>,
  );
}

describe('CreditsChip', () => {
  it('renders the balance', () => {
    renderChip(1500);
    // toLocaleString output varies by jsdom's ICU build; match either form.
    expect(screen.getByTestId('credits-chip-balance').textContent).toMatch(
      /^1[,\s]?500$/,
    );
  });

  it('links to the subscription settings page', () => {
    renderChip(1500);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/organization/subscription');
  });

  it('applies the low-balance warning styling below 50 credits', () => {
    renderChip(10);
    const link = screen.getByRole('link');
    expect(link.className).toMatch(/amber/);
  });

  it('uses neutral styling at 50+ credits', () => {
    renderChip(60);
    const link = screen.getByRole('link');
    expect(link.className).not.toMatch(/amber/);
  });

  it('shows zero balance correctly', () => {
    renderChip(0);
    expect(screen.getByTestId('credits-chip-balance')).toHaveTextContent('0');
  });
});
