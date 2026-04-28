import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { FoldersList } from '../FoldersList';
import type { DocumentFolderItem } from '@/features/documents/contracts/document.types';

vi.mock('@/app/actions/folders', () => ({
  getFolders: vi.fn().mockResolvedValue([]),
  deleteFolder: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    successToast: vi.fn(),
    errorToast: vi.fn(),
  }),
}));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const messages = {
  folders: {
    'all-files': 'All Files',
    'my-files': 'My Files',
    'shared-with-me': 'Shared with me',
    usage: 'Usage',
    storage: 'Storage',
    pages: 'Pages',
    edit: 'Edit',
    delete: 'Delete',
    'delete-title': 'Delete {folderName}',
    'delete-confirm-with-files': 'Delete {count} files?',
    'delete-confirm-empty': 'Delete empty folder?',
    cancel: 'Cancel',
    deleting: 'Deleting...',
    'folder-deleted': 'Folder deleted',
    'failed-to-delete': 'Failed to delete',
    'edit-title': 'Edit Folder',
    'folder-name-label': 'Folder Name',
    'pii-policy-hint': 'hint',
    'folder-updated': 'Folder updated',
    'failed-to-update': 'Failed to update folder',
    save: 'Save',
    saving: 'Saving...',
    'reembed-confirm-title': 'Re-process files?',
    'reembed-confirm-body': 'body',
    'reembed-confirm-action': 'Re-process',
    'reembed-success': 'Processed {succeeded} of {total} files',
    'reembed-partial':
      'Processed {succeeded} of {total} files ({failed} errors)',
    'reembed-empty': 'No files to process',
    'apply-to-subfolders': 'Apply to subfolders',
    'apply-to-subfolders-hint': 'hint',
  },
  'pii-policy': {
    'none-label': 'None',
    'none-description': 'No masking',
    'toxic-only-label': 'Toxic only',
    'toxic-only-description': 'Mask toxic content',
    'strict-label': 'Strict',
    'strict-description': 'Mask all PII',
    'select-label': 'PII Policy',
    label: 'PII Masking Policy',
    'shield-tooltip-none': 'PII Policy: None',
    'shield-tooltip-toxic-only': 'PII Policy: Toxic Only',
    'shield-tooltip-strict': 'PII Policy: Strict',
  },
};

function makeFolder(
  overrides: Partial<DocumentFolderItem> = {},
): DocumentFolderItem {
  return {
    id: 'folder-1',
    name: 'Test Folder',
    teamId: null,
    teamName: null,
    parentId: null,
    path: '/',
    ownerId: null,
    ownerName: null,
    fileCount: 0,
    piiPolicy: 'TOXIC_ONLY',
    ...overrides,
  };
}

function renderList(folders: DocumentFolderItem[]) {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <FoldersList initialFolders={folders} />
    </NextIntlClientProvider>,
  );
}

describe('PiiPolicyIcon in FoldersList', () => {
  it('renders shield icon for folder with NONE policy', () => {
    renderList([makeFolder({ piiPolicy: 'NONE' })]);
    const icon = screen.getByTitle('PII Policy: None');
    expect(icon).toBeInTheDocument();
  });

  it('renders shield icon for folder with TOXIC_ONLY policy', () => {
    renderList([makeFolder({ piiPolicy: 'TOXIC_ONLY' })]);
    const icon = screen.getByTitle('PII Policy: Toxic Only');
    expect(icon).toBeInTheDocument();
  });

  it('renders shield icon for folder with STRICT policy', () => {
    renderList([makeFolder({ piiPolicy: 'STRICT' })]);
    const icon = screen.getByTitle('PII Policy: Strict');
    expect(icon).toBeInTheDocument();
  });

  it('does not render shield icon when piiPolicy is null', () => {
    renderList([makeFolder({ piiPolicy: null })]);
    expect(screen.queryByTitle(/PII Policy/)).not.toBeInTheDocument();
  });
});
