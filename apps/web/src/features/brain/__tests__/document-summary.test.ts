import { expect, it } from 'vitest';
import type { BrainDocument } from '../contracts/brain-documents.types';
import {
  summarizeBrainDocuments,
  documentExtractionState,
} from '../utils/document-summary';

const file = (overrides: Partial<BrainDocument> = {}): BrainDocument => ({
  fileId: 'a',
  fileName: 'a.pdf',
  approvedPages: 2,
  candidatePages: 6,
  language: 'pol',
  retrieval: 'in',
  uploadedAt: null,
  ...overrides,
});
const noPages = { hasPages: false, failure: null };

it('uses one maximum across rows, sorts by language then filename, and counts confirmed empty extractions', () => {
  const files = [
    file(),
    file({ fileId: 'b', language: 'eng', approvedPages: 1, candidatePages: 3 }),
    file({
      fileId: 'c',
      language: null,
      approvedPages: 0,
      candidatePages: 0,
      retrieval: 'withdrawn',
    }),
  ];
  const summary = summarizeBrainDocuments(
    files,
    new Map([
      ['a', { hasPages: true, failure: null }],
      ['b', { hasPages: true, failure: null }],
      ['c', { hasPages: false, failure: { publicId: 'failure', empty: true } }],
    ]),
    'pl',
  );
  expect(summary.maxPages).toBe(8);
  expect(summary.documents.map((row) => row.fileId)).toEqual(['b', 'a', 'c']);
  expect(summary.empty).toBe(1);
  expect(summary.withdrawn).toBe(1);
  expect(files.map((row) => row.fileId)).toEqual(['a', 'b', 'c']);
});

it('distinguishes waiting, failed, processing, extracted and confirmed empty documents', () => {
  const empty = file({ approvedPages: 0, candidatePages: 0 });
  expect(documentExtractionState(empty, noPages)).toBe('waiting');
  expect(
    documentExtractionState(empty, { hasPages: true, failure: null }),
  ).toBe('extracted');
  expect(
    documentExtractionState(empty, {
      hasPages: false,
      failure: { publicId: 'f', empty: true },
    }),
  ).toBe('empty');
  expect(
    documentExtractionState(file(), {
      hasPages: true,
      failure: { publicId: 'f', empty: true },
    }),
  ).toBe('failed');
  expect(
    documentExtractionState(file({ retrieval: 'processing' }), noPages),
  ).toBe('processing');
  expect(documentExtractionState(file({ retrieval: 'failed' }), noPages)).toBe(
    'failed',
  );
});

it('uses a nonzero scale for an empty list', () => {
  expect(summarizeBrainDocuments([], new Map(), 'en')).toMatchObject({
    maxPages: 1,
    empty: 0,
    withdrawn: 0,
  });
});

it('puts the two languages of one document side by side and sorts the rest as before', () => {
  const pair = (fileId: string, language: string) => ({
    fileId: language === 'pol' ? 'pl' : 'en',
    fileName: `${fileId}.pdf`,
    language,
    approvedPages: 1,
    candidatePages: 0,
  });
  const summary = summarizeBrainDocuments(
    [
      file({
        fileId: 'pl',
        fileName: 'a.pdf',
        language: 'pol',
        pair: pair('en', 'eng'),
      }),
      file({ fileId: 'other-en', fileName: 'b.pdf', language: 'eng' }),
      file({
        fileId: 'en',
        fileName: 'z.pdf',
        language: 'eng',
        pair: pair('pl', 'pol'),
      }),
      file({ fileId: 'other-pl', fileName: 'c.pdf', language: 'pol' }),
    ],
    new Map(),
    'en',
  );
  // English first, then Polish. The pair stays together at its first member.
  expect(summary.documents.map((d) => d.fileId)).toEqual([
    'other-en',
    'en',
    'pl',
    'other-pl',
  ]);
});
