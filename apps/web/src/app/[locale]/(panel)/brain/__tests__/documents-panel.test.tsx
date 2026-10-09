import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';
import pl from '@/app/messages/pl.json';
import type { BrainDocument } from '@/features/brain/contracts/brain-documents.types';
import type { BrainDocumentExtraction } from '@/features/brain/contracts/brain-document-extraction.types';
vi.mock('../components/DocumentRowMenu', () => ({
  DocumentRowMenu: ({
    fileId,
    failedExtraction,
  }: {
    fileId: string;
    failedExtraction: string | null;
  }) => <button data-finding={failedExtraction ?? ''}>actions-{fileId}</button>,
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
import { BrainDocumentsPanel } from '../components/BrainDocumentsPanel';
const doc = (
  fileId: string,
  approvedPages: number,
  candidatePages: number,
  language = 'pol',
): BrainDocument => ({
  fileId,
  fileName: `${fileId}.pdf`,
  approvedPages,
  candidatePages,
  language,
  retrieval: 'in',
  uploadedAt: null,
});
const documents = [
  doc('large', 2, 6),
  doc('small', 1, 3, 'eng'),
  doc('empty', 0, 0),
  doc('waiting', 0, 0),
  { ...doc('processing', 0, 0), retrieval: 'processing' as const },
];
const extraction = new Map<string, BrainDocumentExtraction>([
  ['large', { hasPages: true, failure: null }],
  ['small', { hasPages: true, failure: null }],
  [
    'empty',
    { hasPages: false, failure: { publicId: 'finding-empty', empty: true } },
  ],
  ['waiting', { hasPages: false, failure: null }],
  ['processing', { hasPages: false, failure: null }],
]);
const show = (canWrite = true) =>
  render(
    <NextIntlClientProvider locale="pl" messages={pl}>
      <BrainDocumentsPanel
        documents={documents}
        extraction={extraction}
        locale="pl"
        canWrite={canWrite}
      />
    </NextIntlClientProvider>,
  );
it('labels counts, uses one scale, sorts language names and omits language pairing', () => {
  show();
  const rows = screen.getAllByTestId('brain-document-row');
  expect(rows[0]).toHaveTextContent('small.pdf');
  expect(rows[0]).toHaveTextContent('angielski');
  const large = rows.find((row) => row.textContent?.includes('large.pdf'))!;
  expect(large).toHaveTextContent('2 zatwierdzone');
  expect(large).toHaveTextContent('6 do sprawdzenia');
  expect(large.querySelector('[data-segment="approved"]')).toHaveAttribute(
    'width',
    '25',
  );
  expect(rows[0].querySelector('[data-segment="approved"]')).toHaveAttribute(
    'width',
    '12.5',
  );
  expect(screen.getByText(/Skala wspólna: 8/)).toBeVisible();
  expect(screen.queryByText(/Pary PL/)).toBeNull();
});
it('hands the row menu the open failure only, while showing waiting and processing honestly', () => {
  show();
  const failed = screen
    .getAllByTestId('brain-document-row')
    .find((row) => row.textContent?.includes('empty.pdf'))!;
  expect(within(failed).getByText('Nic nie wyodrębniono')).toHaveAttribute(
    'data-variant',
    'destructive',
  );
  expect(
    within(failed).getByRole('button', { name: 'actions-empty' }),
  ).toHaveAttribute('data-finding', 'finding-empty');
  expect(screen.getByText('Nie wyodrębniono jeszcze')).toBeVisible();
  // Processing is the state; the badge does not say it twice.
  expect(screen.getByText('Przetwarzanie')).toBeVisible();
  expect(
    screen
      .getAllByRole('button', { name: /^actions-/ })
      .filter((b) => b.getAttribute('data-finding')),
  ).toHaveLength(1);
});
it('warns only about what is there, counts the documents in the title and links the knowledge base', () => {
  show();
  // One empty extraction, nothing withdrawn: one warning, no zero.
  const warnings = screen.getByTestId('brain-documents-warnings');
  expect(warnings).toHaveTextContent('1 dokument bez wyodrębnionej wiedzy');
  expect(screen.queryByTestId('documents-warning-withdrawn')).toBeNull();
  expect(screen.getByTestId('brain-documents-count')).toHaveTextContent(
    'Dokumenty według języka (5)',
  );
  expect(
    screen.getByRole('link', { name: 'Zarządzaj plikami w Bazie wiedzy' }),
  ).toHaveAttribute('href', '/knowledge/documents-list');
});
it('says a file is kept out of search in the same badge as its state', () => {
  render(
    <NextIntlClientProvider locale="pl" messages={pl}>
      <BrainDocumentsPanel
        documents={[{ ...doc('kept', 1, 0), retrieval: 'withdrawn' }]}
        extraction={new Map([['kept', { hasPages: true, failure: null }]])}
        locale="pl"
        canWrite={false}
      />
    </NextIntlClientProvider>,
  );
  expect(
    screen.getByText('Wyodrębniono · Wyłączony z wyszukiwania'),
  ).toBeVisible();
  expect(screen.getByTestId('documents-warning-withdrawn')).toHaveTextContent(
    '1 dokument wyłączony z wyszukiwania',
  );
});
it('keeps row states visible but hides retry and retrieval commands from readers', () => {
  show(false);
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getAllByTestId('brain-document-row')).toHaveLength(5);
});

it('asks to check undetected languages without flagging a recognized language', () => {
  render(
    <NextIntlClientProvider locale="pl" messages={pl}>
      <BrainDocumentsPanel
        documents={[
          { ...doc('unknown', 0, 0), language: null },
          doc('scots', 0, 0, 'sco'),
        ]}
        extraction={new Map()}
        locale="pl"
        canWrite={false}
      />
    </NextIntlClientProvider>,
  );
  expect(screen.getAllByText('Sprawdź język')).toHaveLength(1);
  expect(screen.getByText('scots')).toBeVisible();
});

it('names the same document in the other language and counts its pages once', () => {
  render(
    <NextIntlClientProvider locale="pl" messages={pl}>
      <BrainDocumentsPanel
        documents={[
          {
            ...doc('pl-policy', 2, 0),
            pair: {
              fileId: 'en-policy',
              fileName: 'en-policy.pdf',
              language: 'eng',
              approvedPages: 3,
              candidatePages: 1,
            },
          },
          doc('lonely', 1, 0),
        ]}
        extraction={new Map()}
        locale="pl"
        canWrite={false}
      />
    </NextIntlClientProvider>,
  );
  const rows = screen.getAllByTestId('brain-document-row');
  const paired = rows.find((row) => within(row).queryByText('pl-policy.pdf'))!;
  const lonely = rows.find((row) => within(row).queryByText('lonely.pdf'))!;
  expect(within(paired).getByTestId('brain-document-pair')).toHaveTextContent(
    'en-policy.pdf',
  );
  expect(
    within(paired).getByText(/Para: 3 zatwierdzonych/),
  ).toBeInTheDocument();
  expect(within(lonely).queryByTestId('brain-document-pair')).toBeNull();
});
