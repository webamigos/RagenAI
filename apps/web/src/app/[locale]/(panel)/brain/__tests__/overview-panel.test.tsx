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
    expect(
      screen.getByRole('link', { name: /Rozpocznij przegląd \(123\)/ }),
    ).toHaveAttribute('href', '/brain/review?lang=pol');
    expect(screen.getByTestId('overview-published')).toHaveTextContent('1');
    expect(
      screen.getByTestId('overview-published').querySelector('a'),
    ).toHaveAttribute('href', '/brain?published=true&lang=pol');
    // The same number the pages list puts on "Opublikuj zatwierdzone".
    expect(
      screen.getByRole('link', { name: '2 zatwierdzone do opublikowania' }),
    ).toHaveAttribute('href', '/brain?status=APPROVED&lang=pol');
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
  });
  it('hides writing actions from readers', () => {
    show(data, false);
    expect(
      screen.queryByRole('link', { name: /Rozpocznij przegląd/ }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Wgraj dokumenty' }),
    ).toBeNull();
    expect(screen.getByTestId('overview-pipeline')).toBeVisible();
  });
});
