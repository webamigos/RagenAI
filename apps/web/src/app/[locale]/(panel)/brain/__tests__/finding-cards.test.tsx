import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createTranslator } from 'next-intl';
import pl from '@/app/messages/pl.json';
import type { KnowledgeFindingListItem } from '@/features/brain/contracts/brain.types';
const query = vi.hoisted(() => vi.fn());
vi.mock('@/features/brain/services/queries/get-orphan-relations-query', () => ({
  getOrphanRelationsQuery: query,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: 'pl', messages: pl, namespace } as never),
  getFormatter: async () => ({ dateTime: (date: Date) => date.toISOString() }),
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('../components/OwnerPicker', () => ({
  OwnerPicker: ({ publicId }: { publicId: string }) => (
    <button>owner:{publicId}</button>
  ),
}));
vi.mock('../components/RetryExtractionButton', () => ({
  RetryExtractionButton: ({ label }: { label: string }) => (
    <button>{label}</button>
  ),
}));
vi.mock('../components/DismissOrphanButton', () => ({
  DismissOrphanButton: () => <button>dismiss</button>,
}));
vi.mock('../components/FindingRelationPicker', () => ({
  FindingRelationPicker: () => <div>relations-picker</div>,
}));
vi.mock('../components/FindingSummaryView', () => ({
  FindingSummaryView: () => <p>summary</p>,
}));
import { FindingCards } from '../components/FindingCards';
const make = (
  type: KnowledgeFindingListItem['type'],
  status: KnowledgeFindingListItem['status'] = 'OPEN',
): KnowledgeFindingListItem => ({
  publicId: type,
  type,
  status,
  severity: 'LOW',
  detectedAt: '2026-10-06T12:00:00Z',
  pages: [{ publicId: 'page', title: 'Page' }],
  reviewPages: [
    {
      publicId: 'page',
      title: 'Page',
      ownerId: null,
      updatedAt: '2026-10-06T12:00:00Z',
    },
  ],
  file: { name: 'file.pdf', documentId: 'document' },
  summary: { kind: 'unknown' },
});
const props = {
  canWrite: true,
  members: [],
  focusedId: null,
  assistant: true,
  discussHref: (id: string) => `/brain/findings?finding=${id}`,
  language: 'pol',
  orgId: 'org',
};
beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue(new Map());
});
it('gives open findings the relevant fix and retains language in review and neighborhood links', async () => {
  render(
    await FindingCards({
      ...props,
      items: [
        make('EXTRACTION_FAILED'),
        make('UNOWNED'),
        make('CONTRADICTION'),
        make('ORPHAN'),
      ],
    }),
  );
  expect(
    screen.getByRole('button', { name: 'Ponów ekstrakcję' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'owner:page' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Otwórz przegląd' })).toHaveAttribute(
    'href',
    '/brain/review?page=page&lang=pol',
  );
  expect(
    screen.getByRole('link', { name: 'Sprawdź powiązania' }),
  ).toHaveAttribute(
    'href',
    '/brain/graph?view=neighbourhood&focus=page&inferred=1&lang=pol',
  );
  expect(query).toHaveBeenCalledWith('org', ['ORPHAN']);
});
it('never exposes write controls or suggestions to read-only users', async () => {
  render(
    await FindingCards({
      ...props,
      canWrite: false,
      items: [make('EXTRACTION_FAILED'), make('UNOWNED'), make('ORPHAN')],
    }),
  );
  expect(screen.queryByRole('button')).toBeNull();
  expect(query).not.toHaveBeenCalled();
});
it('folds consecutive resolved rows into a history group and reveals focused finding', async () => {
  const first = make('EXTRACTION_FAILED', 'RESOLVED');
  const second = {
    ...first,
    publicId: 'second',
    detectedAt: '2026-10-06T11:57:00Z',
  };
  const { container } = render(
    await FindingCards({
      ...props,
      focusedId: 'second',
      items: [first, second],
    }),
  );
  expect(screen.getAllByTestId('brain-finding-batch')).toHaveLength(1);
  expect(container.querySelector('details')).toHaveAttribute('open');
  expect(screen.getByText('2 × Nieudana ekstrakcja')).toBeInTheDocument();
  expect(screen.queryByRole('button')).toBeNull();
  expect(query).not.toHaveBeenCalled();
});
it('names the severity instead of printing it as a second label', async () => {
  render(
    await FindingCards({
      ...props,
      items: [make('ORPHAN')],
    }),
  );
  expect(screen.getByTestId('finding-severity')).toHaveAccessibleName(
    'Ważność: Niska',
  );
});
