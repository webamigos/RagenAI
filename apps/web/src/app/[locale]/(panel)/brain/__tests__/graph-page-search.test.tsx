import { fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';
import messages from '@/app/messages/en.json';
import { GraphPageSearch } from '../components/GraphPageSearch';
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
it('finds any scoped page by title and preserves language in a neighbourhood deep link', () => {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GraphPageSearch
        pages={[
          { id: 'a', title: 'Leave' },
          { id: 'b', title: 'Employee Handbook' },
        ]}
        language="pol"
      />
    </NextIntlClientProvider>,
  );
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'handbook' },
  });
  expect(
    screen.getByRole('link', { name: 'Employee Handbook' }),
  ).toHaveAttribute('href', '/brain/graph?view=neighbourhood&focus=b&lang=pol');
  expect(screen.queryByRole('link', { name: 'Leave' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: 'missing' },
  });
  expect(screen.getByText('Showing 0 of 0 matching pages')).toBeInTheDocument();
});
