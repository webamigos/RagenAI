import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import type { PaginatedUserFilesResult } from '@/features/documents/contracts/document.types';

/*
  The table and the grid are stubbed. Both already know what to do with
  folders and no files — `UserFilesTable` and `GridView` have their own tests
  for that — and what is under test here is the gate above them, which used to
  decide the page was empty before either got the chance.
*/
vi.mock('../FileList/DocumentsTableWithFilters', () => ({
  DocumentsTableWithFilters: ({
    subfolders,
  }: {
    subfolders?: { id: string }[];
  }) => (
    <div data-testid="files-table">{`folders:${subfolders?.length ?? 0}`}</div>
  ),
  DocumentsGridWithFilters: ({ children }: React.PropsWithChildren) => (
    <div data-testid="files-grid">{children}</div>
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

const refresh = vi.hoisted(() => vi.fn());

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }),
  usePathname: () => '/en/knowledge/documents-list',
}));

/*
  The dialog is stubbed to what this test is about: the moment it reports that
  a folder was created. Its own form and the server action behind it are not
  under test here.
*/
vi.mock('../../Folders/CreateFolderDialog', () => ({
  CreateFolderDialog: ({
    isOpen,
    onCreated,
  }: {
    isOpen: boolean;
    onCreated: () => void;
  }) =>
    isOpen ? (
      <button type="button" onClick={onCreated}>
        folder created
      </button>
    ) : null,
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
  folders: {
    'no-documents': 'No documents in knowledge base',
    'no-documents-in-folder': 'This folder is empty',
    'no-shared-files': 'Nothing shared with you',
    'drag-drop': 'Drag & drop files here',
    'upload-cta': 'Upload file',
    'create-document': 'Create document',
    'add-from-url': 'Add from URL',
    new: 'New folder',
    'add-document': 'Add document',
    'from-disk': 'From disk',
  },
  'files-table': {
    'search-placeholder': 'Search',
  },
  'bulk-action-bar': {
    'aria-label': 'Bulk file operations',
    selected: '{count} selected',
    clear: 'Clear selection',
    delete: 'Delete',
    move: 'Move',
    share: 'Share',
  },
};

const emptyResult: PaginatedUserFilesResult = {
  items: [],
  page: 1,
  pageSize: 25,
  totalCount: 0,
  totalPages: 1,
};

function renderWrapper(onFolderMutated?: () => void) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <FileListWrapperWithData
        result={emptyResult}
        sort="createdAt"
        dir="desc"
        selectedFileTypes={[]}
        selectedStatuses={[]}
        selectedPolicies={[]}
        onFolderMutated={onFolderMutated}
      />
    </NextIntlClientProvider>,
  );
}

async function createAFolder() {
  const user = userEvent.setup();

  await user.click(screen.getByRole('button', { name: 'New folder' }));
  await user.click(
    await screen.findByRole('button', { name: 'folder created' }),
  );
}

/*
  #1269. The page above keeps its folders in client state that only its own
  handler reloads; `router.refresh()` re-renders server components and leaves
  that state alone. A folder created with the refresh alone existed in the
  database and on neither list until a hard reload, under a "Folder created"
  toast.
*/
describe('FileListWrapperWithData — creating a folder', () => {
  beforeEach(() => {
    refresh.mockClear();
  });

  it('tells the page, so the page reloads its folders', async () => {
    const onFolderMutated = vi.fn();
    renderWrapper(onFolderMutated);

    await createAFolder();

    expect(onFolderMutated).toHaveBeenCalledTimes(1);
  });

  it('does not refresh the route itself when the page handles it', async () => {
    // The page's handler reloads the folders *and* refreshes the route; doing
    // it here as well would refresh twice for one folder.
    renderWrapper(vi.fn());

    await createAFolder();

    expect(refresh).not.toHaveBeenCalled();
  });

  it('still refreshes the route when no page handler is given', async () => {
    renderWrapper();

    await createAFolder();

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('closes the dialog either way', async () => {
    renderWrapper(vi.fn());

    await createAFolder();

    expect(
      screen.queryByRole('button', { name: 'folder created' }),
    ).not.toBeInTheDocument();
  });
});
