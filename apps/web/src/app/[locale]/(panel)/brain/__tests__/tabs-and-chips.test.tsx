import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '@/app/messages/en.json';

const path = vi.hoisted(() => ({ current: '/brain' }));
vi.mock('@/i18n/routing', () => ({
  usePathname: () => path.current,
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

const { BrainTabs } = await import('../components/BrainTabs');
const { FilterChips } = await import('../components/FilterChips');

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

describe('BrainTabs', () => {
  it.each([
    ['/brain', /exact quotes/],
    ['/brain/pages/x', /A candidate waits for review/],
    ['/brain/findings', /needs your attention/],
    ['/brain/graph', /How pages connect/],
    ['/brain/documents', /source documents/],
  ])('says what %s is for', (pathname, hint) => {
    path.current = pathname;
    wrap(<BrainTabs />);
    expect(screen.getByTestId('brain-tab-hint')).toHaveTextContent(hint);
  });
});

describe('FilterChips', () => {
  it('shows a count when one is given, and none otherwise', () => {
    wrap(
      <FilterChips
        label="Status"
        options={[
          {
            key: 'a',
            label: 'Candidate',
            href: '/a',
            active: true,
            count: 123,
          },
          { key: 'b', label: 'Other', href: '/b', active: false },
        ]}
      />,
    );
    const [candidate, other] = screen.getAllByRole('link');
    expect(candidate).toHaveTextContent('Candidate (123)');
    expect(other).toHaveTextContent(/^Other$/);
  });
});
