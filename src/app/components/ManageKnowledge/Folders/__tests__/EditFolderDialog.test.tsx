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
vi.mock('@/app/actions/folders', () => ({
  updateFolder: (...args: unknown[]) => mockUpdateFolder(...args),
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
  onClose?: () => void;
  onUpdated?: () => void;
};

function renderDialog(props: RenderProps = {}) {
  const {
    isOpen = true,
    folderId = 'folder-1',
    initialName = 'My Folder',
    initialPiiPolicy = 'TOXIC_ONLY',
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
    it('calls updateFolder with trimmed name and piiPolicy', async () => {
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
          piiPolicy: 'STRICT',
        });
      });
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
});
