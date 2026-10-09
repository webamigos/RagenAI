import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  documents: vi.fn(),
  extraction: vi.fn(),
  extractable: vi.fn(),
  panel: vi.fn((_props: Record<string, unknown>) => null),
}));
vi.mock('@/features/brain/services/queries/get-brain-access-query', () => ({
  getBrainAccessQuery: mocks.access,
}));
vi.mock('@/features/brain/services/queries/get-brain-documents-query', () => ({
  getBrainDocumentsQuery: mocks.documents,
}));
vi.mock(
  '@/features/brain/services/queries/get-brain-document-extraction-query',
  () => ({ getBrainDocumentExtractionQuery: mocks.extraction }),
);
vi.mock(
  '@/features/brain/services/queries/get-extractable-documents-query',
  () => ({ getExtractableDocumentsQuery: mocks.extractable }),
);
vi.mock('../components/ExtractDialog', () => ({
  ExtractDialog: ({ documents }: { documents: unknown[] }) => (
    <button>extract {documents.length}</button>
  ),
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw Error('not-found');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
  getLocale: async () => 'pl',
  getFormatter: async () => ({ relativeTime: () => 'relative' }),
}));
vi.mock('../components/BrainDocumentsPanel', () => ({
  BrainDocumentsPanel: mocks.panel,
}));
vi.mock('../components/BrainUploadButton', () => ({
  BrainUploadButton: () => <button>upload</button>,
}));
vi.mock('../components/BrainEmpty', () => ({
  BrainEmpty: ({ title }: { title: string }) => <p>{title}</p>,
}));
vi.mock('../components/assistant/BrainAssistantContext', () => ({
  BrainScreen: () => null,
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children }: React.ComponentProps<'a'>) => (
    <a href={href}>{children}</a>
  ),
}));
const { default: DocumentsPage } = await import('../documents/page');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ orgId: 'session-org', canWrite: false });
  mocks.documents.mockResolvedValue([]);
  mocks.extraction.mockResolvedValue(new Map());
  mocks.extractable.mockResolvedValue([{ fileId: 'a' }]);
});
it('rejects unauthorized access before reading document evidence', async () => {
  mocks.access.mockResolvedValue(null);
  await expect(
    DocumentsPage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow('not-found');
  expect(mocks.documents).not.toHaveBeenCalled();
  expect(mocks.extraction).not.toHaveBeenCalled();
});
it('reads evidence only for scoped filtered files and passes read permissions', async () => {
  mocks.documents.mockResolvedValue([{ fileId: 'visible', retrieval: 'in' }]);
  render(
    await DocumentsPage({
      searchParams: Promise.resolve({ lang: 'pol', coverage: 'empty' }),
    }),
  );
  expect(mocks.documents).toHaveBeenCalledWith('session-org', 'pol', true);
  expect(mocks.extraction).toHaveBeenCalledWith('session-org', ['visible']);
  expect(mocks.panel.mock.calls[0][0]).toMatchObject({
    canWrite: false,
    locale: 'pl',
  });
  expect(screen.getByRole('link', { name: 'clear-filter' })).toHaveAttribute(
    'href',
    '/brain/documents?lang=pol',
  );
  expect(screen.queryByRole('button')).toBeNull();
});
it('renders the language empty state instead of an empty table', async () => {
  render(
    await DocumentsPage({ searchParams: Promise.resolve({ lang: 'eng' }) }),
  );
  expect(screen.getByText('empty-in-language-title')).toBeVisible();
  expect(mocks.panel).not.toHaveBeenCalled();
});
it('offers a curator extraction from the documents already here', async () => {
  mocks.access.mockResolvedValue({ orgId: 'session-org', canWrite: true });
  render(await DocumentsPage({ searchParams: Promise.resolve({}) }));
  expect(mocks.extractable).toHaveBeenCalledWith('session-org');
  expect(screen.getByRole('button', { name: 'extract 1' })).toBeVisible();
});
it('neither offers nor reads extraction for a reader', async () => {
  render(await DocumentsPage({ searchParams: Promise.resolve({}) }));
  expect(mocks.extractable).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /extract/ })).toBeNull();
});
