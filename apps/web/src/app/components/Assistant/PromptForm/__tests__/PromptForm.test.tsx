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
import { PromptForm, type PromptFormRef } from '../PromptForm';
import { ChatResponseType } from '@/features/messages/contracts/message.types';
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

// Mock i18n routing
vi.mock('@/i18n/routing', () => ({
  usePathname: vi.fn(() => '/en/chats/123'),
  useRouter: vi.fn(() => ({ push: vi.fn(), replace: vi.fn() })),
  Link: ({ children, ...props }: React.PropsWithChildren<{ href: string }>) => (
    <a {...props}>{children}</a>
  ),
}));

// Mock dialog components to simplify tests
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

// Mock voice input hook
vi.mock('@/app/hooks/useAudioRecording', () => ({
  useVoiceInput: () => ({
    startListening: vi.fn(),
    stopListening: vi.fn(),
    isRecording: false,
    error: null,
  }),
}));

const messages = {
  form: {
    'enter-your-question': 'Enter your question',
    'prompt-min': 'Provide at least 10 characters',
    'prompt-max': 'Provide less than 10,000 characters',
  },
  'text-area': {
    placeholder: 'Type your question...',
  },
  'prompt-attachments': {
    // The attach button's label used to be a hardcoded English string in the
    // component, in a product that ships fifteen locales.
    'add-attachment': 'Add attachment',
    'send-message': 'Send message',
    'upload-file': 'Upload file',
    'from-knowledge-base': 'From Knowledge Base',
    'from-google-drive': 'From Google Drive',
    'from-fireflies': 'From Fireflies',
  },
};

const defaultProps = {
  isLoading: false,
  isUserLogged: true,
  onSubmit: vi.fn(),
  responseType: ChatResponseType.TEXT,
};

const renderPromptForm = (props = {}, ref?: React.Ref<PromptFormRef>) => {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <PromptForm ref={ref} {...defaultProps} {...props} />
    </NextIntlClientProvider>,
  );
};

describe('PromptForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the textarea', () => {
      renderPromptForm();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders the attachment button for authenticated users', () => {
      renderPromptForm();
      expect(screen.getByLabelText('Add attachment')).toBeInTheDocument();
    });

    it('hides attachment button for public access', () => {
      renderPromptForm({ isPublicAccess: true });
      expect(screen.queryByLabelText('Add attachment')).not.toBeInTheDocument();
    });

    it('renders hidden file input', () => {
      const { container } = renderPromptForm();
      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute(
        'accept',
        '.md,.srt,.txt,.pdf,.epub,.jpg,.jpeg,.png,.webp,.gif,.csv,.xlsx,.xls,.docx,.pptx,.ppt',
      );
      expect(fileInput).toHaveAttribute('multiple');
    });
  });

  describe('attachment dropdown menu', () => {
    it('shows Upload file option when dropdown is opened', async () => {
      const user = userEvent.setup();
      renderPromptForm();

      await user.click(screen.getByLabelText('Add attachment'));

      expect(screen.getByText('Upload file')).toBeInTheDocument();
      expect(screen.getByText('From Knowledge Base')).toBeInTheDocument();
    });

    it('does not show Google Drive option when not connected', async () => {
      const user = userEvent.setup();
      renderPromptForm();

      await user.click(screen.getByLabelText('Add attachment'));

      expect(screen.queryByText('From Google Drive')).not.toBeInTheDocument();
    });

    it('does not show Fireflies option when not connected', async () => {
      const user = userEvent.setup();
      renderPromptForm();

      await user.click(screen.getByLabelText('Add attachment'));

      expect(screen.queryByText('From Fireflies')).not.toBeInTheDocument();
    });

    it('shows Google Drive option when connected', async () => {
      const { isDriveConnected } = await import('@/app/actions/google-drive');
      vi.mocked(isDriveConnected).mockResolvedValueOnce(true);

      const user = userEvent.setup();
      renderPromptForm();

      await user.click(screen.getByLabelText('Add attachment'));

      await waitFor(() => {
        expect(screen.getByText('From Google Drive')).toBeInTheDocument();
      });
    });
  });

  describe('form submission', () => {
    it('calls onSubmit with form data when prompt is valid', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderPromptForm({ onSubmit });

      const textarea = screen.getByRole('textbox');
      await user.type(
        textarea,
        'This is a valid prompt with enough characters',
      );

      // Submit via Enter key
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
      });
    });

    it('does not submit when prompt is too short', async () => {
      const onSubmit = vi.fn();
      const user = userEvent.setup();
      renderPromptForm({ onSubmit });

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'short');

      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      await waitFor(() => {
        expect(onSubmit).not.toHaveBeenCalled();
      });
    });

    it('allows newline with Shift+Enter', async () => {
      const onSubmit = vi.fn();
      renderPromptForm({ onSubmit });

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, {
        key: 'Enter',
        code: 'Enter',
        shiftKey: true,
      });

      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  describe('imperative handle (ref)', () => {
    it('exposes reset method via ref', () => {
      const ref = createRef<PromptFormRef>();
      renderPromptForm({}, ref);

      expect(ref.current).toBeDefined();
      expect(typeof ref.current?.reset).toBe('function');
    });

    it('exposes dropFiles method via ref', () => {
      const ref = createRef<PromptFormRef>();
      renderPromptForm({}, ref);

      expect(typeof ref.current?.dropFiles).toBe('function');
    });

    it('reset clears the prompt value', async () => {
      const ref = createRef<PromptFormRef>();
      const user = userEvent.setup();
      renderPromptForm({}, ref);

      const textarea = screen.getByRole('textbox');
      await user.type(textarea, 'Hello world test');

      act(() => {
        ref.current?.reset('');
      });

      await waitFor(() => {
        expect(textarea).toHaveValue('');
      });
    });
  });

  describe('file drop handling', () => {
    it('adds valid dropped files as thread documents', async () => {
      const ref = createRef<PromptFormRef>();
      renderPromptForm({}, ref);

      const file = new File(['test content'], 'test.txt', {
        type: 'text/plain',
      });

      await act(async () => {
        ref.current?.dropFiles([file]);
      });

      // The file badge should appear after processing
      await waitFor(() => {
        expect(screen.getByText('test.txt')).toBeInTheDocument();
      });
    });

    it('ignores unsupported file types on drop', async () => {
      const ref = createRef<PromptFormRef>();
      renderPromptForm({}, ref);

      const file = new File(['binary data'], 'archive.zip', {
        type: 'application/zip',
      });

      await act(async () => {
        ref.current?.dropFiles([file]);
      });

      // Should not appear since .zip is unsupported
      expect(screen.queryByText('archive.zip')).not.toBeInTheDocument();
    });
  });

  describe('document removal', () => {
    it('removes a document when remove button is clicked', async () => {
      const ref = createRef<PromptFormRef>();
      const user = userEvent.setup();
      renderPromptForm({}, ref);

      const file = new File(['test content'], 'removable.txt', {
        type: 'text/plain',
      });

      await act(async () => {
        ref.current?.dropFiles([file]);
      });

      await waitFor(() => {
        expect(screen.getByText('removable.txt')).toBeInTheDocument();
      });

      // Find the remove button on the file badge (aria-label set by FileBadge)
      const removeBtn = screen.getByRole('button', {
        name: /remove removable\.txt/i,
      });
      expect(removeBtn).toBeInTheDocument();

      await user.click(removeBtn!);
      await waitFor(() => {
        expect(screen.queryByText('removable.txt')).not.toBeInTheDocument();
      });
    });
  });

  describe('public access mode', () => {
    it('does not check for Drive/Fireflies connectors', async () => {
      const { isDriveConnected } = await import('@/app/actions/google-drive');
      const { isFirefliesConnected } = await import('@/app/actions/fireflies');
      vi.mocked(isDriveConnected).mockClear();
      vi.mocked(isFirefliesConnected).mockClear();

      renderPromptForm({ isPublicAccess: true });

      // Give the useEffect a chance to run (it shouldn't for public access)
      await waitFor(() => {
        expect(vi.mocked(isDriveConnected)).not.toHaveBeenCalled();
        expect(vi.mocked(isFirefliesConnected)).not.toHaveBeenCalled();
      });
    });

    it('does not pass file handling props to textarea', () => {
      renderPromptForm({ isPublicAccess: true });
      // No attachment button should be rendered
      expect(screen.queryByLabelText('Add attachment')).not.toBeInTheDocument();
    });
  });
});
