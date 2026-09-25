import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';

import messages from '@/app/messages/en.json';

const segment = vi.hoisted(() => ({ current: null as string | null }));
const search = vi.hoisted(() => ({ current: '' }));
vi.mock('next/navigation', () => ({
  useSelectedLayoutSegment: () => segment.current,
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

const { BrainTabs } = await import('../components/BrainTabs');
const { FilterChips } = await import('../components/FilterChips');

const wrap = (ui: React.ReactNode) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

describe('BrainTabs', () => {
  // The segment under /brain. A page in the graph's drawer is `graph`, as
  // the graph is what fills the screen; the full page is `pages`.
  it.each([
    [null, /exact quotes/],
    ['pages', /exact quotes/],
    ['findings', /needs your attention/],
    ['graph', /How pages connect/],
    ['documents', /source documents/],
  ])('says what %s is for', (current, hint) => {
    segment.current = current;
    wrap(<BrainTabs />);
    expect(screen.getByTestId('brain-tab-hint')).toHaveTextContent(hint);
  });

  it('keeps the language filter on every tab’s link', () => {
    segment.current = 'graph';
    search.current = 'lang=pol&status=APPROVED';
    try {
      wrap(<BrainTabs />);
      // The language is Brain-wide; a tab's own filters are not.
      expect(screen.getByRole('link', { name: 'Findings' })).toHaveAttribute(
        'href',
        '/brain/findings?lang=pol',
      );
      expect(
        screen.getByRole('link', { name: 'Knowledge pages' }),
      ).toHaveAttribute('href', '/brain?lang=pol');
    } finally {
      search.current = '';
    }
  });

  it('marks the active tab for assistive technology, not only by its look', () => {
    segment.current = 'graph';
    wrap(<BrainTabs />);
    expect(screen.getByRole('link', { name: 'Graph' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(
      screen.getByRole('link', { name: 'Knowledge pages' }),
    ).not.toHaveAttribute('aria-current');
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
    // Label and count are separate items, spaced by the chip's gap — a
    // leading space in the count was trimmed by flex and read "Candidate123".
    expect(candidate.children).toHaveLength(1);
    expect(candidate.children[0]).toHaveTextContent(/^123$/);
    expect(candidate.className).toContain('gap-1.5');
    expect(candidate).toHaveTextContent('Candidate');
    expect(other).toHaveTextContent(/^Other$/);
  });
});
