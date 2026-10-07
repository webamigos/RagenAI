import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import type {
  PaginatedUserFilesResult,
  UserFileType,
} from '@/features/documents/contracts/document.types';

/*
  The table and the grid are stubbed. Both already know what to do with
  folders and no files — `UserFilesTable` and `GridView` have their own tests
  for that — and what is under test here is the gate above them, which used to
  decide the page was empty before either got the chance.
*/
vi.mock('../FileList/DocumentsTableWithFilters', () => ({
  DocumentsTableWithFilters: ({ files }: { files: { id: string }[] }) => (
    <div data-testid="files-table">{files.map((f) => f.id).join(',')}</div>
  ),
  DocumentsGridWithFilters: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
}));

/* The preview slide-over pulls pdf.js in, which wants a canvas jsdom has not. */
vi.mock('../../DocumentPreview/DocumentPreviewSlideOver', () => ({
  DocumentPreviewSlideOver: () => null,
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    successToast: vi.fn(),
    errorToast: vi.fn(),
    warningToast: vi.fn(),
  }),
}));

vi.mock('@/app/hooks/useUserFilesContext', () => ({
  useUserFilesContext: () => ({
    addFile: vi.fn(),
    removeFile: vi.fn(),
    currentFolderId: 'folder-1',
    viewMode: 'all',
  }),
}));

vi.mock('@/app/hooks/use-auth', () => ({
  useUser: () => ({ user: { id: 'user-1' } }),
  useOrganization: () => ({ canManageOrg: true }),
}));

vi.mock('@/app/hooks/useSettings', () => ({
  useSettings: () => ({ refreshSettings: vi.fn() }),
}));

vi.mock('@/app/hooks/useOrgFeatures', () => ({
  useOrgFeature: () => true,
}));

vi.mock('@/app/actions', () => ({
  deleteFileAction: vi.fn(),
  getPiiIngestionModeAction: vi.fn(async () => 'destructive'),
}));

vi.mock('@/app/actions/folders', () => ({
  getFolderPiiPolicy: vi.fn(async () => 'TOXIC_ONLY'),
}));

vi.mock('@/app/actions/teams', () => ({ getTeams: vi.fn(async () => []) }));

vi.mock('@/app/actions/permissions', () => ({
  getOrgMembersAndTeams: vi.fn(async () => ({ members: [], teams: [] })),
}));

vi.mock('@/app/actions/bulk-documents', () => ({
  bulkDeleteFilesAction: vi.fn(),
  bulkReembedFilesAction: vi.fn(),
  bulkUpdatePiiPolicyAction: vi.fn(),
}));

vi.mock('@/app/lib/services/api', () => ({ uploadFiles: vi.fn() }));

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/en/knowledge/documents-list',
}));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { FileListWrapperWithData } from '../UserFilesWrapper';

const messages = {
  'success-toast': {},
  'error-toast': {},
  'bulk-notifications': {},
  'knowledge-list': { 'group-pairs': 'Group language pairs' },
  'document-pairs': {},
  folders: {},
  'files-table': {},
  'bulk-action-bar': {},
};

const file = (id: string, twin?: string): UserFileType => ({
  id,
  organizationId: 'org',
  fileName: `${id}.pdf`,
  fileSize: 1,
  fileType: 'PDF',
  projectId: null,
  project: null,
  pairedWith: twin
    ? {
        id: twin,
        fileName: `${twin}.pdf`,
        language: 'eng',
        piiPolicy: 'STRICT',
      }
    : null,
});

function show(items: UserFileType[]) {
  const result: PaginatedUserFilesResult = {
    items,
    page: 1,
    pageSize: 25,
    totalCount: items.length,
    totalPages: 1,
  };
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FileListWrapperWithData
        knowledgeList
        result={result}
        sort="createdAt"
        dir="desc"
        selectedFileTypes={[]}
        selectedStatuses={[]}
        selectedPolicies={[]}
        subfolders={[]}
      />
    </NextIntlClientProvider>,
  );
}

describe('the "Group language pairs" toggle', () => {
  it('offers no toggle when nothing on the page is paired', () => {
    show([file('a'), file('b')]);
    expect(
      screen.queryByRole('button', { name: 'Group language pairs' }),
    ).toBeNull();
  });

  it('keeps the list order until pressed, then puts counterparts together', () => {
    window.localStorage.clear();
    show([file('a', 'z'), file('b'), file('z', 'a')]);
    expect(screen.getByTestId('files-table')).toHaveTextContent('a,b,z');
    const toggle = screen.getByRole('button', { name: 'Group language pairs' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('files-table')).toHaveTextContent('a,z,b');
    fireEvent.click(toggle);
    expect(screen.getByTestId('files-table')).toHaveTextContent('a,b,z');
  });

  it('remembers the choice', () => {
    window.localStorage.setItem('ragen:group-language-pairs', '1');
    show([file('a', 'z'), file('b'), file('z', 'a')]);
    expect(screen.getByTestId('files-table')).toHaveTextContent('a,z,b');
  });
});
