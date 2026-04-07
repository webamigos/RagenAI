import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { KnowledgeBasePickerDialog } from '../KnowledgeBasePickerDialog';

// Mock server action
const mockGetAllOrgFiles = vi.fn().mockResolvedValue({
  files: [
    {
      id: 'file-1',
      fileName: 'report.pdf',
      fileSize: 1024 * 500,
      fileType: 'PDF',
      createdAt: new Date('2026-01-15'),
      project: { id: 1, title: 'Marketing' },
    },
    {
      id: 'file-2',
      fileName: 'notes.md',
      fileSize: 256,
      fileType: 'MARKDOWN',
      createdAt: new Date('2026-02-10'),
      project: null,
    },
    {
      id: 'file-3',
      fileName: 'data.txt',
      fileSize: 1024 * 1024 * 2.5,
      fileType: 'TEXT',
      createdAt: new Date('2026-03-01'),
      project: { id: 2, title: 'Research' },
    },
  ],
});

vi.mock('@/app/actions', () => ({
  getAllOrgFiles: (...args: unknown[]) => mockGetAllOrgFiles(...args),
}));

const messages = {
  'knowledge-picker': {
    title: 'Select from Knowledge Base',
    'search-placeholder': 'Search files...',
    'no-results': 'No files match your search',
    'no-files': 'No files in knowledge base',
    cancel: 'Cancel',
    'add-selected':
      '{count, plural, =0 {selected} =1 {1 file} other {# files}}',
  },
};

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  onFilesSelected: vi.fn(),
};

const renderDialog = (props = {}) => {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <KnowledgeBasePickerDialog {...defaultProps} {...props} />
    </NextIntlClientProvider>,
  );
};

describe('KnowledgeBasePickerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders dialog title when open', async () => {
      renderDialog();
      await waitFor(() => {
        expect(
          screen.getByText('Select from Knowledge Base'),
        ).toBeInTheDocument();
      });
    });

    it('renders search input', async () => {
      renderDialog();
      await waitFor(() => {
        expect(
          screen.getByPlaceholderText('Search files...'),
        ).toBeInTheDocument();
      });
    });

    it('renders cancel button', async () => {
      renderDialog();
      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });
    });

    it('does not render content when closed', () => {
      renderDialog({ open: false });
      expect(
        screen.queryByText('Select from Knowledge Base'),
      ).not.toBeInTheDocument();
    });
  });

  describe('file loading', () => {
    it('loads files when dialog opens', async () => {
      renderDialog();
      await waitFor(() => {
        expect(mockGetAllOrgFiles).toHaveBeenCalled();
      });
    });

    it('displays loaded files', async () => {
      renderDialog();
      await waitFor(() => {
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
        expect(screen.getByText('notes.md')).toBeInTheDocument();
        expect(screen.getByText('data.txt')).toBeInTheDocument();
      });
    });

    it('displays file sizes formatted correctly', async () => {
      renderDialog();
      await waitFor(() => {
        expect(screen.getByText(/500\.0 KB/)).toBeInTheDocument(); // 1024 * 500 bytes = 500.0 KB
        expect(screen.getByText(/256 B/)).toBeInTheDocument();
        expect(screen.getByText(/2\.5 MB/)).toBeInTheDocument();
      });
    });

    it('displays project names for files with projects', async () => {
      renderDialog();
      await waitFor(() => {
        expect(screen.getByText('Marketing')).toBeInTheDocument();
        expect(screen.getByText('Research')).toBeInTheDocument();
      });
    });

    it('shows empty state when no files exist', async () => {
      mockGetAllOrgFiles.mockResolvedValueOnce({ files: [] });
      renderDialog();
      await waitFor(() => {
        expect(
          screen.getByText('No files in knowledge base'),
        ).toBeInTheDocument();
      });
    });
  });

  describe('search filtering', () => {
    it('filters files by search query', async () => {
      const user = userEvent.setup();
      renderDialog();

      await waitFor(() => {
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search files...');
      await user.type(searchInput, 'report');

      expect(screen.getByText('report.pdf')).toBeInTheDocument();
      expect(screen.queryByText('notes.md')).not.toBeInTheDocument();
      expect(screen.queryByText('data.txt')).not.toBeInTheDocument();
    });

    it('search is case-insensitive', async () => {
      const user = userEvent.setup();
      renderDialog();

      await waitFor(() => {
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search files...');
      await user.type(searchInput, 'NOTES');

      expect(screen.getByText('notes.md')).toBeInTheDocument();
      expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
    });

    it('shows no-results message when search matches nothing', async () => {
      const user = userEvent.setup();
      renderDialog();

      await waitFor(() => {
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search files...');
      await user.type(searchInput, 'nonexistent');

      expect(
        screen.getByText('No files match your search'),
      ).toBeInTheDocument();
    });
  });

  describe('file selection', () => {
    it('toggles file selection on click', async () => {
      const user = userEvent.setup();
      renderDialog();

      await waitFor(() => {
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
      });

      await user.click(screen.getByText('report.pdf'));

      // The confirm button should now be enabled with count
      expect(screen.getByText('1 file')).toBeInTheDocument();
    });

    it('supports multi-select', async () => {
      const user = userEvent.setup();
      renderDialog();

      await waitFor(() => {
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
      });

      await user.click(screen.getByText('report.pdf'));
      await user.click(screen.getByText('notes.md'));

      expect(screen.getByText('2 files')).toBeInTheDocument();
    });

    it('deselects file on second click', async () => {
      const user = userEvent.setup();
      renderDialog();

      await waitFor(() => {
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
      });

      await user.click(screen.getByText('report.pdf'));
      expect(screen.getByText('1 file')).toBeInTheDocument();

      await user.click(screen.getByText('report.pdf'));
      // Back to 0 selected
      expect(screen.getByText('selected')).toBeInTheDocument();
    });

    it('calls onFilesSelected with selected files on confirm', async () => {
      const onFilesSelected = vi.fn();
      const user = userEvent.setup();
      renderDialog({ onFilesSelected });

      await waitFor(() => {
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
      });

      await user.click(screen.getByText('report.pdf'));
      await user.click(screen.getByText('notes.md'));
      await user.click(screen.getByText('2 files'));

      expect(onFilesSelected).toHaveBeenCalledWith([
        {
          id: 'file-1',
          name: 'report.pdf',
          size: 1024 * 500,
          type: 'PDF',
        },
        {
          id: 'file-2',
          name: 'notes.md',
          size: 256,
          type: 'MARKDOWN',
        },
      ]);
    });

    it('closes dialog after confirm', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderDialog({ onOpenChange });

      await waitFor(() => {
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
      });

      await user.click(screen.getByText('report.pdf'));
      await user.click(screen.getByText('1 file'));

      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('excludeFileIds', () => {
    it('excludes specified files from the list', async () => {
      renderDialog({ excludeFileIds: ['file-1', 'file-3'] });

      await waitFor(() => {
        expect(screen.getByText('notes.md')).toBeInTheDocument();
      });

      expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
      expect(screen.queryByText('data.txt')).not.toBeInTheDocument();
    });
  });

  describe('cancel button', () => {
    it('calls onOpenChange(false) when cancel is clicked', async () => {
      const onOpenChange = vi.fn();
      const user = userEvent.setup();
      renderDialog({ onOpenChange });

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Cancel'));
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('state reset on reopen', () => {
    it('resets search and selection when dialog reopens', async () => {
      const user = userEvent.setup();
      const { rerender } = render(
        <NextIntlClientProvider messages={messages} locale="en">
          <KnowledgeBasePickerDialog {...defaultProps} open={true} />
        </NextIntlClientProvider>,
      );

      await waitFor(() => {
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
      });

      // Set some state: type in search and select a file
      const searchInput = screen.getByPlaceholderText('Search files...');
      await user.type(searchInput, 'report');
      await user.click(screen.getByText('report.pdf'));
      expect(screen.getByText('1 file')).toBeInTheDocument();

      // Close
      rerender(
        <NextIntlClientProvider messages={messages} locale="en">
          <KnowledgeBasePickerDialog {...defaultProps} open={false} />
        </NextIntlClientProvider>,
      );

      // Reopen
      rerender(
        <NextIntlClientProvider messages={messages} locale="en">
          <KnowledgeBasePickerDialog {...defaultProps} open={true} />
        </NextIntlClientProvider>,
      );

      // Search and selection should be cleared
      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search files...')).toHaveValue('');
        // All files visible again (search cleared)
        expect(screen.getByText('report.pdf')).toBeInTheDocument();
        expect(screen.getByText('notes.md')).toBeInTheDocument();
        // Selection reset (0 count)
        expect(screen.getByText('selected')).toBeInTheDocument();
      });
    });
  });
});
