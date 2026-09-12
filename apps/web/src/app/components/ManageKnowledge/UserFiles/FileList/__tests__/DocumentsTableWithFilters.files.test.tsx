import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { DocumentsTableWithFilters } from '../DocumentsTableWithFilters';
import { EmbeddingStatus } from '@/generated/prisma/browser';
import type { UserFileType } from '@/features/documents/contracts/document.types';
import type { PaginatedUserFilesResult } from '@/features/documents/contracts/document.types';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const mockRouterPush = vi.fn();
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockRouterPush(...args),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: vi.fn(() => '/pl/knowledge/documents-list'),
  Link: ({ children, href }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@ragenai/common-ui/Tooltip', () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@/app/hooks/useOnClickOutside', () => ({
  useOnClickOutside: () => {},
}));

const messages = {
  'files-table': {
    'file-name': 'File Name',
    'file-size': 'File Size',
    created: 'Created',
    processed: 'Processed',
    'sort-file-name': 'File Name',
    'sort-file-size': 'File Size',
    'sort-created': 'Date Added',
    'sort-file-type': 'Type',
    'filter-file-type': 'File type',
    'filter-file-type-all': 'All types',
    'filter-embedding-status': 'Status',
    'filter-embedding-status-all': 'All statuses',
    'filter-status-not-started': 'Pending',
    'filter-status-started': 'Processing',
    'filter-status-completed': 'Completed',
    'filter-status-failed': 'Failed',
    'reset-filters': 'Reset filters',
    'no-results-for-filters': 'No documents match the selected filters',
    'no-files': 'No files',
    'sort-label': 'Sort',
    'sort-dir-asc': 'Ascending',
    'sort-dir-desc': 'Descending',
    'status-ready': 'Ready',
    'status-processing': 'Processing',
    'status-failed': 'Failed',
    'status-uploading': 'Uploading',
    'score-rag': 'Score for RAG',
    delete: 'Delete',
    edit: 'Edit',
    view: 'View',
    preview: 'Preview',
    download: 'Download',
    move: 'Move',
    share: 'Share',
    'pagination-info': 'Page {page} of {totalPages}',
  },
  'bulk-action-bar': {
    'aria-label': 'Bulk file operations',
    selected: '{count} selected',
    'select-all': 'Select all',
    'select-file': 'Select {fileName}',
    clear: 'Clear selection',
    delete: 'Delete',
    move: 'Move',
    share: 'Share',
    reembed: 'Re-embed',
  },
  folders: {
    title: 'Folders',
    'all-files': 'All Files',
    'my-files': 'My Files',
    'shared-with-me': 'Shared with me',
    'no-documents': 'No documents in knowledge base',
    'drag-drop': 'Drag & drop files here',
    'upload-cta': 'Upload file',
    'create-document': 'Create document',
    'add-from-url': 'Add from URL',
  },
  'document-optimizer': {
    'badge-label': 'RAG: {score}',
    'score-tooltip': 'RAG readiness: {score}/100.',
  },
  'file-delete-modal': {
    title: 'Delete file',
    description: 'Are you sure you want to delete {fileName}?',
    deleting: 'Deleting...',
    delete: 'Delete',
    cancel: 'Cancel',
  },
};

const makeFile = (id: string, name: string): UserFileType => ({
  id,
  organizationId: 'org-1',
  fileName: name,
  fileSize: 1024,
  fileType: 'PDF',
  projectId: 'proj-1',
  project: null,
  embeddingStatus: EmbeddingStatus.COMPLETED,
  embeddingStartedAt: null,
  embeddingCompletedAt: null,
  embeddingFailedAt: null,
});

const makeResult = (items: UserFileType[]): PaginatedUserFilesResult => ({
  items,
  page: 1,
  pageSize: 25,
  totalCount: items.length,
  totalPages: 1,
});

const baseProps = {
  sort: 'createdAt' as const,
  dir: 'desc' as const,
  selectedFileTypes: [],
  selectedStatuses: [],
  selectedPolicies: [],
  showModal: { isOpen: false, fileId: null },
  deleteLoading: false,
  toggleModal: vi.fn(),
  addFile: vi.fn(),
  removeFile: vi.fn(),
  handleDelete: vi.fn(),
};

function renderComponent(
  props: Partial<typeof baseProps> & {
    result: PaginatedUserFilesResult;
    files?: UserFileType[];
  },
) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <DocumentsTableWithFilters {...baseProps} {...props} />
    </NextIntlClientProvider>,
  );
}

describe('DocumentsTableWithFilters — prop files', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockRouterPush.mockClear();
  });

  it('wyświetla pliki z result.items gdy files nie jest podany', () => {
    const result = makeResult([
      makeFile('a', 'alfa.pdf'),
      makeFile('b', 'beta.pdf'),
    ]);
    renderComponent({ result });

    expect(screen.getByText('alfa.pdf')).toBeInTheDocument();
    expect(screen.getByText('beta.pdf')).toBeInTheDocument();
  });

  it('wyświetla pliki z prop files zamiast result.items gdy files jest podany', () => {
    const result = makeResult([
      makeFile('a', 'alfa.pdf'),
      makeFile('b', 'beta.pdf'),
    ]);
    const filteredFiles = [makeFile('a', 'alfa.pdf')];
    renderComponent({ result, files: filteredFiles });

    expect(screen.getByText('alfa.pdf')).toBeInTheDocument();
    expect(screen.queryByText('beta.pdf')).not.toBeInTheDocument();
  });

  it('wyświetla pustą tabelę gdy files=[] mimo niepustego result.items', () => {
    const result = makeResult([makeFile('a', 'alfa.pdf')]);
    renderComponent({ result, files: [] });

    expect(screen.queryByText('alfa.pdf')).not.toBeInTheDocument();
    // Pusta tabela — brak wierszy danych
    expect(
      screen.queryByRole('row', { name: /alfa/i }),
    ).not.toBeInTheDocument();
  });

  it('używa result.items gdy files jest undefined (fallback)', () => {
    const result = makeResult([makeFile('c', 'gamma.pdf')]);
    renderComponent({ result, files: undefined });

    expect(screen.getByText('gamma.pdf')).toBeInTheDocument();
  });

  it('paginacja opiera się na result, nie na files', () => {
    const allItems = Array.from({ length: 3 }, (_, i) =>
      makeFile(`id-${i}`, `file-${i}.pdf`),
    );
    const result: PaginatedUserFilesResult = {
      ...makeResult(allItems),
      page: 1,
      totalPages: 3,
    };
    const files = [allItems[0]];
    renderComponent({ result, files });

    // paginacja na podstawie result.totalPages=3, nie files.length=1
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
  });
});
