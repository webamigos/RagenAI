import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
import pl from '@/app/messages/pl.json';
import type { BrainOverview } from '@/features/brain/contracts/brain-overview.types';
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
vi.mock('../components/BrainUploadButton', () => ({
  BrainUploadButton: () => <button>Wgraj dokumenty</button>,
}));
import { BrainOverviewPanel } from '../components/BrainOverviewPanel';
const data: BrainOverview = {
  documents: 27,
  emptyDocuments: 3,
  candidates: 123,
  approved: 3,
  published: 1,
  awaitingPublication: 2,
  unownedCandidates: 123,
  openFindings: { ORPHAN: 2 },
  topDocuments: [
    {
      fileId: 'f1',
      fileName: 'Regulamin.pdf',
      candidatePages: 12,
      approvedPages: 3,
      retrieval: 'in',
      uploadedAt: null,
      language: 'pol',
    },
  ],
};
function show(value = data, canWrite = true) {
  return render(
    <NextIntlClientProvider locale="pl" messages={pl}>
      <BrainOverviewPanel data={value} language="pol" canWrite={canWrite} />
    </NextIntlClientProvider>,
  );
}
describe('BrainOverviewPanel', () => {
  it('links each pipeline stage and attention count to the matching filtered list', () => {
    show();
    // The whole tile is the link, not only its caption.
    const published = screen.getByTestId('overview-published');
    expect(published.tagName).toBe('A');
    expect(published).toHaveAttribute('href', '/brain?published=true&lang=pol');
    expect(published).toHaveTextContent('1');
    // The same number the pages list puts on "Opublikuj zatwierdzone".
    expect(published).toHaveTextContent('2 zatwierdzone do opublikowania');
    expect(screen.getByTestId('overview-approved')).toHaveTextContent(
      '3 z 126 stron',
    );
    expect(
      screen.getByRole('link', { name: /Strony bez właściciela/ }),
    ).toHaveAttribute('href', '/brain?status=CANDIDATE&owner=none&lang=pol');
    expect(
      screen.getByRole('link', { name: /Dokumenty bez wiedzy/ }),
    ).toHaveAttribute('href', '/brain/documents?coverage=empty&lang=pol');
    expect(screen.getByRole('link', { name: /Bez powiązań/ })).toHaveAttribute(
      'href',
      '/brain/findings?status=OPEN&type=ORPHAN&lang=pol',
    );
  });
  it('labels chart counts without depending on color or hover', () => {
    show();
    expect(screen.getByTestId('overview-ranking-legend')).toHaveTextContent(
      /zatwierdzone.*do sprawdzenia/,
    );
    expect(
      screen.getByRole('link', { name: /Regulamin.pdf/ }),
    ).toHaveTextContent('3 zatwierdzone');
    expect(
      screen.getByRole('link', { name: /Regulamin.pdf/ }),
    ).toHaveTextContent('12 do sprawdzenia');
  });
  it('shows a compact empty state and upload action rather than a zero chart', () => {
    show({
      ...data,
      documents: 0,
      emptyDocuments: 0,
      candidates: 0,
      approved: 0,
      published: 0,
      unownedCandidates: 0,
      awaitingPublication: 0,
      openFindings: {},
      topDocuments: [],
    });
    expect(screen.getByText('Wiedza zaczyna się od dokumentów')).toBeVisible();
    expect(screen.getByText(/W tym języku nie ma dokumentów/)).toBeVisible();
    expect(screen.queryByTestId('overview-pipeline')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Wgraj dokumenty' }),
    ).toBeVisible();
    expect(screen.queryByTestId('overview-next-step')).toBeNull();
  });
  it('asks for owners before review, and never sends to a review it cannot finish', () => {
    show();
    const step = screen.getByTestId('overview-next-step');
    expect(step).toHaveTextContent('Co teraz?');
    expect(step).toHaveTextContent('Przypisz właścicieli do 123 stron');
    expect(
      screen.getByRole('link', { name: 'Przypisz właścicieli' }),
    ).toHaveAttribute('href', '/brain?status=CANDIDATE&owner=none&lang=pol');
    expect(screen.queryByRole('link', { name: /Tryb przeglądu/ })).toBeNull();
  });
  it('sends to review once the pages have owners, then to publishing', () => {
    const { unmount } = show({ ...data, unownedCandidates: 0 });
    expect(
      screen.getByRole('link', { name: 'Otwórz Tryb przeglądu' }),
    ).toHaveAttribute('href', '/brain/review?lang=pol');
    expect(screen.getByTestId('overview-next-step')).toHaveTextContent(
      'Sprawdź 123 strony',
    );
    unmount();
    show({ ...data, candidates: 0, unownedCandidates: 0 });
    expect(screen.getByTestId('overview-next-step')).toHaveTextContent(
      'Opublikuj 2 zatwierdzone strony',
    );
  });
  it('hides writing actions from readers', () => {
    show(data, false);
    expect(screen.queryByTestId('overview-next-step')).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Wgraj dokumenty' }),
    ).toBeNull();
    expect(screen.getByTestId('overview-pipeline')).toBeVisible();
  });
});
