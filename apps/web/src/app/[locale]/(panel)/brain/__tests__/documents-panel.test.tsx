import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';
import pl from '@/app/messages/pl.json';
import type { BrainDocument } from '@/features/brain/contracts/brain-documents.types';
import type { BrainDocumentExtraction } from '@/features/brain/contracts/brain-document-extraction.types';
vi.mock('../components/RetryExtractionButton', () => ({
  RetryExtractionButton: ({
    findingPublicId,
    label,
  }: {
    findingPublicId: string;
    label?: string;
  }) => <button data-finding={findingPublicId}>{label}</button>,
}));
vi.mock('../components/DocumentRetrievalActions', () => ({
  DocumentRetrievalActions: ({ fileId }: { fileId: string }) => (
    <button>retrieval-{fileId}</button>
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
it('offers the existing retry only for an open failure, while showing waiting and processing honestly', () => {
  show();
  const failed = screen
    .getAllByTestId('brain-document-row')
    .find((row) => row.textContent?.includes('empty.pdf'))!;
  expect(within(failed).getByText('Nic nie wyodrębniono')).toHaveAttribute(
    'data-variant',
    'destructive',
  );
  expect(
    within(failed).getByRole('button', { name: 'Ponów ekstrakcję' }),
  ).toHaveAttribute('data-finding', 'finding-empty');
  expect(screen.getByText('Nie wyodrębniono jeszcze')).toBeVisible();
  expect(screen.getByText('Przetwarzanie')).toBeVisible();
  expect(
    screen.getAllByRole('button', { name: 'Ponów ekstrakcję' }),
  ).toHaveLength(1);
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
