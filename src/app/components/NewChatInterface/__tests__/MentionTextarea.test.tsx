import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import {
  MentionTextarea,
  type MentionTextareaRef,
  type MentionedProject,
} from '../MentionTextarea';
import { createRef } from 'react';

// Mock server actions
vi.mock('@/app/actions/google-drive', () => ({
  isDriveConnected: vi.fn().mockResolvedValue(false),
  getDriveFileContent: vi.fn().mockResolvedValue({
    success: true,
    content: 'Drive content',
    name: 'Drive Doc',
    mime_type: 'text/plain',
  }),
}));

vi.mock('@/app/actions/fireflies', () => ({
  isFirefliesConnected: vi.fn().mockResolvedValue(false),
}));

// Mock file upload API
vi.mock('@/app/lib/services/api', () => ({
  uploadFiles: vi.fn().mockResolvedValue({
    files: [
      {
        fileName: 'uploaded.txt',
        fileSize: 100,
        uniqueFileId: 'file-123',
      },
    ],
  }),
}));

// Mock dialog components
vi.mock('@/app/components/KnowledgeBasePickerDialog', () => ({
  KnowledgeBasePickerDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="kb-picker-dialog">KB Picker</div> : null,
}));

vi.mock('@/app/components/GoogleDrivePickerDialog', () => ({
  GoogleDrivePickerDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="drive-picker-dialog">Drive Picker</div> : null,
}));

vi.mock('@/app/components/FirefliesPickerDialog', () => ({
  FirefliesPickerDialog: ({ open }: { open: boolean }) =>
    open ? (
      <div data-testid="fireflies-picker-dialog">Fireflies Picker</div>
    ) : null,
}));

// Mock ProjectMentionDropdown
vi.mock('../ProjectMentionDropdown', () => ({
  ProjectMentionDropdown: ({
    query,
    onSelect,
    onClose,
  }: {
    query: string;
    onSelect: (project: MentionedProject) => void;
    onClose: () => void;
  }) => (
    <div data-testid="mention-dropdown" data-project-dropdown>
      <span data-testid="mention-query">{query}</span>
      <button
        data-testid="select-project"
        onClick={() => onSelect({ id: 'proj-1', title: 'Test Project' })}
      >
        Select
      </button>
      <button data-testid="close-dropdown" onClick={onClose}>
        Close
      </button>
    </div>
  ),
}));

// Mock voice input hook
vi.mock('@/app/hooks/useAudioRecording', () => ({
  useVoiceInput: () => ({
    startListening: vi.fn(),
    stopListening: vi.fn(),
    isRecording: false,
    error: null,
  }),
}));

// Mock logger
vi.mock('@/app/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock toast
vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    errorToast: vi.fn(),
    successToast: vi.fn(),
  }),
}));

const messages = {
  'text-area': {
    placeholder: 'Type your question...',
  },
  'prompt-attachments': {
    'upload-file': 'Upload file',
    'from-knowledge-base': 'From Knowledge Base',
    'from-google-drive': 'From Google Drive',
    'from-fireflies': 'From Fireflies',
  },
};

const defaultProps = {
  value: '',
  onChange: vi.fn(),
  onKeyDown: vi.fn(),
  handleSubmit: vi.fn(),
  placeholder: 'Type your question...',
  disabled: false,
  showVoiceInput: false,
};

const renderMentionTextarea = (
  props = {},
  ref?: React.Ref<MentionTextareaRef>,
) => {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <MentionTextarea ref={ref} {...defaultProps} {...props} />
    </NextIntlClientProvider>,
  );
};

describe('MentionTextarea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the textarea', () => {
      renderMentionTextarea();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders attachment button by default', () => {
      renderMentionTextarea();
      expect(screen.getByLabelText('Add attachment')).toBeInTheDocument();
    });

    it('hides attachment button when hideAttachments is true', () => {
      renderMentionTextarea({ hideAttachments: true });
      expect(screen.queryByLabelText('Add attachment')).not.toBeInTheDocument();
    });

    it('renders hidden file input when attachments are shown', () => {
      const { container } = renderMentionTextarea();
      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
    });

    it('does not render file input when hideAttachments is true', () => {
      const { container } = renderMentionTextarea({ hideAttachments: true });
      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).not.toBeInTheDocument();
    });
  });

  describe('@mention functionality', () => {
    it('shows mention dropdown when @ is typed', async () => {
      const onChange = vi.fn();
      renderMentionTextarea({ onChange });

      const textarea = screen.getByRole('textbox');

      // Simulate typing @ in the textarea
      fireEvent.change(textarea, { target: { value: '@', selectionStart: 1 } });

      await waitFor(() => {
        expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument();
      });
    });

    it('passes the query text after @ to the dropdown', async () => {
      const onChange = vi.fn();
      renderMentionTextarea({ onChange });

      const textarea = screen.getByRole('textbox');

      // First trigger @ to open dropdown, then type more
      Object.defineProperty(textarea, 'selectionStart', {
        value: 5,
        writable: true,
      });
      fireEvent.change(textarea, {
        target: { value: '@test', selectionStart: 5 },
      });

      await waitFor(() => {
        expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument();
        expect(screen.getByTestId('mention-query')).toHaveTextContent('test');
      });
    });

    it('hides dropdown when text no longer contains @', async () => {
      const onChange = vi.fn();
      renderMentionTextarea({ onChange });

      const textarea = screen.getByRole('textbox');

      // Show dropdown
      fireEvent.change(textarea, { target: { value: '@', selectionStart: 1 } });
      await waitFor(() => {
        expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument();
      });

      // Remove @
      fireEvent.change(textarea, {
        target: { value: 'hello', selectionStart: 5 },
      });

      await waitFor(() => {
        expect(
          screen.queryByTestId('mention-dropdown'),
        ).not.toBeInTheDocument();
      });
    });

    it('calls onProjectMention when a project is selected', async () => {
      const onProjectMention = vi.fn();
      const onChange = vi.fn();
      const user = userEvent.setup();

      renderMentionTextarea({ onProjectMention, onChange });

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '@', selectionStart: 1 } });

      await waitFor(() => {
        expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument();
      });

      await user.click(screen.getByTestId('select-project'));

      expect(onProjectMention).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'proj-1',
          title: 'Test Project',
        }),
      );
    });

    it('clears mention when project name is removed from text', async () => {
      const onProjectMention = vi.fn();
      const mentionedProject: MentionedProject = {
        id: 'proj-1',
        title: 'My Project',
      };

      renderMentionTextarea({
        value: '@My Project hello',
        mentionedProject,
        onProjectMention,
      });

      const textarea = screen.getByRole('textbox');
      // Simulate user removing the @My Project mention from text
      Object.defineProperty(textarea, 'selectionStart', {
        value: 5,
        writable: true,
      });
      fireEvent.change(textarea, {
        target: { value: 'hello', selectionStart: 5 },
      });

      expect(onProjectMention).toHaveBeenCalledWith(null);
    });
  });

  describe('keyboard handling', () => {
    it('closes dropdown on Escape key', async () => {
      const onChange = vi.fn();
      renderMentionTextarea({ onChange });

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '@', selectionStart: 1 } });

      await waitFor(() => {
        expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument();
      });

      fireEvent.keyDown(textarea, { key: 'Escape' });

      await waitFor(() => {
        expect(
          screen.queryByTestId('mention-dropdown'),
        ).not.toBeInTheDocument();
      });
    });

    it('prevents Enter submission when dropdown is open', async () => {
      const onKeyDown = vi.fn();
      const onChange = vi.fn();
      renderMentionTextarea({ onKeyDown, onChange });

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '@', selectionStart: 1 } });

      await waitFor(() => {
        expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument();
      });

      fireEvent.keyDown(textarea, { key: 'Enter' });

      // The outer onKeyDown should NOT be called when dropdown intercepts Enter
      expect(onKeyDown).not.toHaveBeenCalled();
    });

    it('passes keyDown to outer handler when dropdown is closed', () => {
      const onKeyDown = vi.fn();
      renderMentionTextarea({ onKeyDown });

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'a' });

      expect(onKeyDown).toHaveBeenCalled();
    });
  });

  describe('document management', () => {
    it('displays thread documents when provided', () => {
      const threadDocuments = [
        {
          name: 'report.txt',
          content: 'Report content',
          size: 100,
          type: 'text/plain',
        },
      ];

      renderMentionTextarea({
        threadDocuments,
        onThreadDocumentsChange: vi.fn(),
      });

      expect(screen.getByText('report.txt')).toBeInTheDocument();
    });

    it('handles knowledge base file selection', async () => {
      const onThreadDocumentsChange = vi.fn();
      const user = userEvent.setup();

      renderMentionTextarea({ onThreadDocumentsChange });

      // Open attachment menu
      await user.click(screen.getByLabelText('Add attachment'));

      // Click "From Knowledge Base"
      await user.click(screen.getByText('From Knowledge Base'));

      await waitFor(() => {
        expect(screen.getByTestId('kb-picker-dialog')).toBeInTheDocument();
      });
    });
  });

  describe('imperative handle', () => {
    it('exposes dropFiles method via ref', () => {
      const ref = createRef<MentionTextareaRef>();
      renderMentionTextarea({}, ref);

      expect(ref.current).toBeDefined();
      expect(typeof ref.current?.dropFiles).toBe('function');
    });
  });

  describe('click outside', () => {
    it('closes dropdown when clicking outside', async () => {
      const onChange = vi.fn();
      renderMentionTextarea({ onChange });

      const textarea = screen.getByRole('textbox');
      fireEvent.change(textarea, { target: { value: '@', selectionStart: 1 } });

      await waitFor(() => {
        expect(screen.getByTestId('mention-dropdown')).toBeInTheDocument();
      });

      // Click outside
      fireEvent.mouseDown(document.body);

      await waitFor(() => {
        expect(
          screen.queryByTestId('mention-dropdown'),
        ).not.toBeInTheDocument();
      });
    });
  });
});
