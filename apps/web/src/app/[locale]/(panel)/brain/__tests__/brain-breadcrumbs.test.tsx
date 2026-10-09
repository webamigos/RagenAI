import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '@/app/messages/pl.json';

const search = vi.hoisted(() => ({ current: '' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(search.current),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({
    href,
    children,
    ...rest
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { BrainBreadcrumbs } = await import('../components/BrainBreadcrumbs');

describe('BrainBreadcrumbs', () => {
  it('leads from Brain through the pages tab to the current screen', () => {
    search.current = 'lang=pol';
    render(
      <NextIntlClientProvider locale="pl" messages={messages}>
        <BrainBreadcrumbs current="Acme Industries" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('link', { name: 'Brain' })).toHaveAttribute(
      'href',
      '/brain/overview?lang=pol',
    );
    expect(screen.getByRole('link', { name: 'Strony wiedzy' })).toHaveAttribute(
      'href',
      '/brain?lang=pol',
    );
    // The screen itself is named, not linked.
    expect(screen.getByText('Acme Industries')).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.queryByRole('link', { name: 'Acme Industries' })).toBeNull();
  });
});
