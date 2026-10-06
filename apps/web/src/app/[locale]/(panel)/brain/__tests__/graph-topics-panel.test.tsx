import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';
import messages from '@/app/messages/en.json';
import { BrainTopicMap } from '../components/BrainTopicMap';
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
it('renders complete counts, labelled review states and scoped group/isolated destinations', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <BrainTopicMap
        summary={{
          topics: [
            {
              anchor: 'a',
              label: 'Handbook',
              approved: 1,
              candidates: 1,
              pages: [
                {
                  id: 'a',
                  title: 'A',
                  type: 'ENTITY',
                  status: 'APPROVED',
                  community: 0,
                  degree: 1,
                },
                {
                  id: 'b',
                  title: 'B',
                  type: 'POLICY',
                  status: 'CANDIDATE',
                  community: 0,
                  degree: 1,
                },
              ],
            },
          ],
          isolated: [
            {
              id: 'c',
              title: 'C',
              type: 'ENTITY',
              status: 'CANDIDATE',
              community: 1,
              degree: 0,
            },
          ],
        }}
        language="pol"
        selected="a"
      />
    </NextIntlClientProvider>,
  );
  expect(screen.getByRole('link', { name: /Handbook/ })).toHaveAttribute(
    'href',
    '/brain/graph?view=topics&topic=a&lang=pol',
  );
  expect(screen.getByText('2 pages')).toBeInTheDocument();
  expect(screen.getAllByText('Has approved pages').length).toBeGreaterThan(0);
  expect(
    screen.getByRole('link', { name: 'Review isolated pages' }),
  ).toHaveAttribute('href', '/brain/graph?view=topics&topic=isolated&lang=pol');
  expect(screen.queryByText(/PL ↔ EN/)).not.toBeInTheDocument();
});
