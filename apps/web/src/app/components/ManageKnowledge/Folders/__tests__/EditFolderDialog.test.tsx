import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { EditFolderDialog } from '../EditFolderDialog';

const mockSuccessToast = vi.fn();
const mockErrorToast = vi.fn();
vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    successToast: (...args: unknown[]) => mockSuccessToast(...args),
    errorToast: (...args: unknown[]) => mockErrorToast(...args),
  }),
}));

const mockUpdateFolder = vi.fn();
const mockReembedFolder = vi.fn();
vi.mock('@/app/actions/folders', () => ({
  updateFolder: (...args: unknown[]) => mockUpdateFolder(...args),
  reembedFolderAction: (...args: unknown[]) => mockReembedFolder(...args),
  getFileCountInFolder: (...args: unknown[]) => Promise.resolve(3),
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
    'edit-title': 'Edit Folder',
    'folder-name-label': 'Folder Name',
    'pii-policy-hint':
      'Changes apply to new files uploaded into this folder. Existing files are not affected.',
    'folder-updated': 'Folder updated',
    'failed-to-update': 'Failed to update folder',
    save: 'Save',
    saving: 'Saving...',
    cancel: 'Cancel',
    'reembed-confirm-title': 'Re-process files?',
    'reembed-confirm-body':
      'Changing the PII policy will re-process all files in this folder. Existing vectors will be replaced.',
    'reembed-confirm-action': 'Re-process',
    'reembed-success': 'Processed {succeeded} of {total} files',
    'reembed-partial':
      'Processed {succeeded} of {total} files ({failed} errors)',
    'reembed-empty': 'No files to process',
    'apply-to-subfolders': 'Apply to subfolders',
    'apply-to-subfolders-hint':
      'Changes policy in all subfolders and re-processes their files',
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
  },
};

type RenderProps = {
  isOpen?: boolean;
  folderId?: string;
  initialName?: string;
  initialPiiPolicy?: 'NONE' | 'TOXIC_ONLY' | 'STRICT' | null;
  hasSubfolders?: boolean;
  onClose?: () => void;
  onUpdated?: () => void;
};

function renderDialog(props: RenderProps = {}) {
  const {
    isOpen = true,
    folderId = 'folder-1',
    initialName = 'My Folder',
    initialPiiPolicy = 'TOXIC_ONLY',
    hasSubfolders = false,
    onClose = vi.fn(),
    onUpdated = vi.fn(),
  } = props;

  const result = render(
    <NextIntlClientProvider messages={messages} locale="en">
      <EditFolderDialog
        isOpen={isOpen}
        folderId={folderId}
        initialName={initialName}
        initialPiiPolicy={initialPiiPolicy}
        hasSubfolders={hasSubfolders}
        onClose={onClose}
        onUpdated={onUpdated}
      />
    </NextIntlClientProvider>,
  );

  return { ...result, onClose, onUpdated };
}

describe('EditFolderDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateFolder.mockResolvedValue(undefined);
  });

  describe('visibility', () => {
    it('shows dialog content when isOpen is true', () => {
      renderDialog({ isOpen: true });
      expect(
        screen.getByRole('heading', { name: 'Edit Folder' }),
      ).toBeInTheDocument();
    });

    it('hides dialog content when isOpen is false', () => {
      renderDialog({ isOpen: false });
      expect(
        screen.queryByRole('heading', { name: 'Edit Folder' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('reset on open', () => {
    it('resets name input to initialName when opened', () => {
      renderDialog({ isOpen: true, initialName: 'Test Folder' });
      expect(screen.getByDisplayValue('Test Folder')).toBeInTheDocument();
    });

    it('resets piiPolicy to initialPiiPolicy when opened', () => {
      renderDialog({ isOpen: true, initialPiiPolicy: 'STRICT' });
      const select = screen.getByRole('combobox', { name: 'PII Policy' });
      expect((select as HTMLSelectElement).value).toBe('STRICT');
    });

    it('defaults piiPolicy to TOXIC_ONLY when initialPiiPolicy is null', () => {
      renderDialog({ isOpen: true, initialPiiPolicy: null });
      const select = screen.getByRole('combobox', { name: 'PII Policy' });
      expect((select as HTMLSelectElement).value).toBe('TOXIC_ONLY');
    });

    it('focuses the name input when opened', async () => {
      renderDialog({ isOpen: true });
      await waitFor(() => {
        expect(screen.getByRole('textbox')).toHaveFocus();
      });
    });
  });

  describe('validation', () => {
    it('disables Save button when name is empty', async () => {
      const user = userEvent.setup();
      renderDialog({ isOpen: true, initialName: 'Folder' });

      const input = screen.getByRole('textbox');
      await user.clear(input);

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('disables Save button when name is whitespace only', async () => {
      const user = userEvent.setup();
      renderDialog({ isOpen: true, initialName: 'Folder' });

      const input = screen.getByRole('textbox');
      await user.clear(input);
      await user.type(input, '   ');

      expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    });

    it('does not call updateFolder when submitted with empty name', async () => {
      const user = userEvent.setup();
      renderDialog({ isOpen: true, initialName: '' });

      const saveBtn = screen.getByRole('button', { name: 'Save' });
      expect(saveBtn).toBeDisabled();
      expect(mockUpdateFolder).not.toHaveBeenCalled();
    });
  });

  describe('successful submit', () => {
    /**
     * The name, and only the name.
     *
     * The select opens on the folder's *effective* policy, which for a folder
     * with no override is the TOXIC_ONLY fallback. Sending that back turned
     * "rename a folder" into "give this folder an explicit policy" — and the
     * rail's tag renders on the column being set, so renaming a folder tagged
     * it. A policy the person actually changed goes through the reembed path
     * instead.
     */
    it('calls updateFolder with the trimmed name and no policy', async () => {
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: '  Trimmed  ',
        initialPiiPolicy: 'STRICT',
      });

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockUpdateFolder).toHaveBeenCalledWith('folder-1', {
          name: 'Trimmed',
        });
      });
    });

    /**
     * The case that produced the tag on every folder: a folder with no
     * override, renamed. `initialPiiPolicy` is undefined, the select shows the
     * fallback, and nothing about the policy may reach the server.
     */
    it('does not give an unset folder a policy just because it was renamed', async () => {
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'Contracts',
        initialPiiPolicy: null,
      });

      await user.clear(screen.getByRole('textbox'));
      await user.type(screen.getByRole('textbox'), 'Contracts 2026');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockUpdateFolder).toHaveBeenCalledWith('folder-1', {
          name: 'Contracts 2026',
        });
      });
      expect(mockReembedFolder).not.toHaveBeenCalled();
    });

    it('shows success toast on successful update', async () => {
      const user = userEvent.setup();
      renderDialog({ isOpen: true, initialName: 'My Folder' });

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockSuccessToast).toHaveBeenCalledWith({
          message: 'Folder updated',
        });
      });
    });

    it('calls onClose and onUpdated after successful update', async () => {
      const user = userEvent.setup();
      const { onClose, onUpdated } = renderDialog({
        isOpen: true,
        initialName: 'My Folder',
      });

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(onClose).toHaveBeenCalled();
        expect(onUpdated).toHaveBeenCalled();
      });
    });
  });

  describe('failed submit', () => {
    it('shows error toast when updateFolder throws', async () => {
      mockUpdateFolder.mockRejectedValueOnce(new Error('Server error'));
      const user = userEvent.setup();
      renderDialog({ isOpen: true, initialName: 'My Folder' });

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockErrorToast).toHaveBeenCalledWith({
          message: 'Failed to update folder',
        });
      });
    });

    it('does not call onClose or onUpdated when updateFolder throws', async () => {
      mockUpdateFolder.mockRejectedValueOnce(new Error('Server error'));
      const user = userEvent.setup();
      const { onClose, onUpdated } = renderDialog({
        isOpen: true,
        initialName: 'My Folder',
      });

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockErrorToast).toHaveBeenCalled();
      });
      expect(onClose).not.toHaveBeenCalled();
      expect(onUpdated).not.toHaveBeenCalled();
    });
  });

  describe('cancel button', () => {
    it('calls onClose when Cancel is clicked', async () => {
      const user = userEvent.setup();
      const { onClose } = renderDialog({ isOpen: true });

      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('pii policy change — reembed confirmation', () => {
    beforeEach(() => {
      mockReembedFolder.mockResolvedValue({
        succeeded: ['file-1', 'file-2', 'file-3'],
        failed: [],
        total: 3,
      });
    });

    it('shows confirmation dialog when pii policy changes', async () => {
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'TOXIC_ONLY',
      });

      const select = screen.getByRole('combobox', { name: /pii/i });
      await user.selectOptions(select, 'STRICT');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(screen.getByText('Re-process files?')).toBeInTheDocument();
      });
    });

    it('does NOT show confirmation when policy is unchanged', async () => {
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'STRICT',
      });

      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(mockUpdateFolder).toHaveBeenCalled();
      });
      expect(screen.queryByText('Re-process files?')).not.toBeInTheDocument();
    });

    it('calls reembedFolderAction when confirmed', async () => {
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'TOXIC_ONLY',
      });

      const select = screen.getByRole('combobox', { name: /pii/i });
      await user.selectOptions(select, 'STRICT');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => {
        expect(screen.getByText('Re-process files?')).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: 'Re-process' }));

      await waitFor(() => {
        expect(mockReembedFolder).toHaveBeenCalledWith(
          'folder-1',
          'STRICT',
          false,
        );
      });
    });

    it('shows success toast after reembed with all files succeeded', async () => {
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'TOXIC_ONLY',
      });

      const select = screen.getByRole('combobox', { name: /pii/i });
      await user.selectOptions(select, 'STRICT');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => screen.getByText('Re-process files?'));
      await user.click(screen.getByRole('button', { name: 'Re-process' }));

      await waitFor(() => {
        expect(mockSuccessToast).toHaveBeenCalledWith({
          message: 'Processed 3 of 3 files',
        });
      });
    });

    it('calls updateFolder (name only) AND reembedFolderAction when confirmed', async () => {
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'TOXIC_ONLY',
      });

      const select = screen.getByRole('combobox', { name: /pii/i });
      await user.selectOptions(select, 'STRICT');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => screen.getByText('Re-process files?'));
      await user.click(screen.getByRole('button', { name: 'Re-process' }));

      await waitFor(() => {
        expect(mockUpdateFolder).toHaveBeenCalledWith('folder-1', {
          name: 'My Folder',
        });
        expect(mockReembedFolder).toHaveBeenCalledWith(
          'folder-1',
          'STRICT',
          false,
        );
      });
    });

    it('shows partial toast when some files failed', async () => {
      mockReembedFolder.mockResolvedValue({
        succeeded: ['file-1', 'file-2'],
        failed: [
          {
            fileId: 'file-3',
            fileName: 'file-3.pdf',
            error: 'workflow_start_failed',
          },
        ],
        total: 3,
      });
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'TOXIC_ONLY',
      });

      const select = screen.getByRole('combobox', { name: /pii/i });
      await user.selectOptions(select, 'STRICT');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => screen.getByText('Re-process files?'));
      await user.click(screen.getByRole('button', { name: 'Re-process' }));

      await waitFor(() => {
        expect(mockSuccessToast).toHaveBeenCalledWith({
          message: 'Processed 2 of 3 files (1 errors)',
        });
      });
    });

    it('shows empty toast when folder has no files', async () => {
      mockReembedFolder.mockResolvedValue({
        succeeded: [],
        failed: [],
        total: 0,
      });
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'TOXIC_ONLY',
      });

      const select = screen.getByRole('combobox', { name: /pii/i });
      await user.selectOptions(select, 'STRICT');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => screen.getByText('Re-process files?'));
      await user.click(screen.getByRole('button', { name: 'Re-process' }));

      await waitFor(() => {
        expect(mockSuccessToast).toHaveBeenCalledWith({
          message: 'No files to process',
        });
      });
    });

    it('shows error toast and does not call reembedFolderAction when updateFolder throws during confirm', async () => {
      mockUpdateFolder.mockRejectedValueOnce(new Error('network error'));
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'TOXIC_ONLY',
      });

      const select = screen.getByRole('combobox', { name: /pii/i });
      await user.selectOptions(select, 'STRICT');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => screen.getByText('Re-process files?'));
      await user.click(screen.getByRole('button', { name: 'Re-process' }));

      await waitFor(() => {
        expect(mockErrorToast).toHaveBeenCalled();
      });
      expect(mockReembedFolder).not.toHaveBeenCalled();
    });
  });

  describe('recursive checkbox in reembed confirmation', () => {
    beforeEach(() => {
      mockReembedFolder.mockResolvedValue({
        succeeded: ['file-1'],
        failed: [],
        total: 1,
      });
    });

    it('checkbox is not shown when folder has no subfolders', async () => {
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'TOXIC_ONLY',
        hasSubfolders: false,
      });

      const select = screen.getByRole('combobox', { name: /pii/i });
      await user.selectOptions(select, 'STRICT');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => screen.getByText('Re-process files?'));

      expect(
        screen.queryByRole('checkbox', { name: /subfolders/i }),
      ).not.toBeInTheDocument();
    });

    it('checkbox is unchecked by default', async () => {
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'TOXIC_ONLY',
        hasSubfolders: true,
      });

      const select = screen.getByRole('combobox', { name: /pii/i });
      await user.selectOptions(select, 'STRICT');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => screen.getByText('Re-process files?'));

      const checkbox = screen.getByRole('checkbox', { name: /subfolders/i });
      expect(checkbox).not.toBeChecked();
    });

    it('calls reembedFolderAction with recursive=false when checkbox unchecked', async () => {
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'TOXIC_ONLY',
        hasSubfolders: true,
      });

      const select = screen.getByRole('combobox', { name: /pii/i });
      await user.selectOptions(select, 'STRICT');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => screen.getByText('Re-process files?'));
      await user.click(screen.getByRole('button', { name: 'Re-process' }));

      await waitFor(() => {
        expect(mockReembedFolder).toHaveBeenCalledWith(
          'folder-1',
          'STRICT',
          false,
        );
      });
    });

    it('calls reembedFolderAction with recursive=true when checkbox checked', async () => {
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'TOXIC_ONLY',
        hasSubfolders: true,
      });

      const select = screen.getByRole('combobox', { name: /pii/i });
      await user.selectOptions(select, 'STRICT');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => screen.getByText('Re-process files?'));

      await user.click(screen.getByRole('checkbox', { name: /subfolders/i }));
      await user.click(screen.getByRole('button', { name: 'Re-process' }));

      await waitFor(() => {
        expect(mockReembedFolder).toHaveBeenCalledWith(
          'folder-1',
          'STRICT',
          true,
        );
      });
    });

    it('resets checkbox to unchecked when confirmation modal is cancelled', async () => {
      const user = userEvent.setup();
      renderDialog({
        isOpen: true,
        initialName: 'My Folder',
        initialPiiPolicy: 'TOXIC_ONLY',
        hasSubfolders: true,
      });

      const select = screen.getByRole('combobox', { name: /pii/i });
      await user.selectOptions(select, 'STRICT');
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => screen.getByText('Re-process files?'));

      // Check the checkbox then cancel
      await user.click(screen.getByRole('checkbox', { name: /subfolders/i }));
      await user.click(screen.getByRole('button', { name: 'Cancel' }));

      // Reopen the confirmation by clicking Save again
      await user.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => screen.getByText('Re-process files?'));

      // Checkbox should be unchecked again
      expect(
        screen.getByRole('checkbox', { name: /subfolders/i }),
      ).not.toBeChecked();
    });
  });
});
