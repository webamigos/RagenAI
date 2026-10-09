import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';

import messages from '@/app/messages/pl.json';
import type { GraphTopics } from '@/features/brain/utils/graph-topics';

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

const { BrainTopicMap } = await import('../components/BrainTopicMap');

const page = (id: string) => ({ id }) as GraphTopics['isolated'][number];
const summary = {
  topics: [
    {
      anchor: 'a',
      label: 'Zamówienia',
      approved: 0,
      pages: [page('a'), page('b'), page('c')],
    },
    { anchor: 'd', label: 'Kary umowne', approved: 2, pages: [page('d')] },
  ],
  isolated: [],
} as unknown as GraphTopics;

it('explains the colours above the tiles, and states both counts on each', () => {
  render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <BrainTopicMap summary={summary} language={null} selected={null} />
    </NextIntlClientProvider>,
  );
  const legend = screen.getByTestId('brain-topic-legend');
  expect(legend).toHaveTextContent('Jest zatwierdzona strona');
  expect(legend).toHaveTextContent('Same do sprawdzenia');
  // Before the first tile in document order.
  const [first] = screen.getAllByTestId('brain-topic');
  expect(
    legend.compareDocumentPosition(first!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(first).toHaveTextContent('3 strony · 0 zatwierdzonych');
  expect(screen.getAllByTestId('brain-topic')[1]).toHaveTextContent(
    '1 strona · 2 zatwierdzone',
  );
});
