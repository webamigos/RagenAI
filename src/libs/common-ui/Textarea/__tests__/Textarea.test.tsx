import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { Textarea } from '../Textarea';
import { createRef } from 'react';

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
  'text-area': {
    placeholder: 'Type your question...',
  },
};

const renderTextarea = (props = {}) => {
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <Textarea {...props} />
    </NextIntlClientProvider>,
  );
};

describe('Textarea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders the textarea element', () => {
      renderTextarea();
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('renders with default placeholder', () => {
      renderTextarea();
      expect(
        screen.getByPlaceholderText('Type your question...'),
      ).toBeInTheDocument();
    });

    it('renders label when provided', () => {
      renderTextarea({ label: 'Your question' });
      expect(screen.getByText('Your question')).toBeInTheDocument();
    });

    it('renders mandatory indicator when mandatory is true', () => {
      renderTextarea({ label: 'Required field', mandatory: true });
      expect(screen.getByText('*')).toBeInTheDocument();
    });

    it('renders hint text when provided', () => {
      renderTextarea({ hint: 'This is a helpful hint' });
      expect(screen.getByText('This is a helpful hint')).toBeInTheDocument();
    });

    it('renders with disabled state', () => {
      renderTextarea({ disabled: true });
      expect(screen.getByRole('textbox')).toBeDisabled();
    });

    it('forwards ref to the textarea element', () => {
      const ref = createRef<HTMLTextAreaElement>();
      render(
        <NextIntlClientProvider messages={messages} locale="en">
          <Textarea ref={ref} />
        </NextIntlClientProvider>,
      );
      expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
    });
  });

  describe('send button', () => {
    it('renders send button by default', () => {
      renderTextarea({ value: 'Hello world', onSend: vi.fn() });
      // The send icon is an ArrowRightCircleIcon wrapped in a button
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('hides send button when showArrowIcon is false', () => {
      renderTextarea({ showArrowIcon: false, showVoiceInput: false });
      // No buttons should be rendered (no voice, no send, no attachment)
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('calls onSend when send button is clicked with text', async () => {
      const onSend = vi.fn();
      const user = userEvent.setup();
      renderTextarea({ value: 'Hello world', onSend, showVoiceInput: false });

      const buttons = screen.getAllByRole('button');
      // The last button should be the send button
      await user.click(buttons[buttons.length - 1]);

      expect(onSend).toHaveBeenCalled();
    });
  });

  describe('keyboard interactions', () => {
    it('calls onSend on Enter key press', () => {
      const onSend = vi.fn();
      renderTextarea({ value: 'Test message', onSend });

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      expect(onSend).toHaveBeenCalled();
    });

    it('does not call onSend on Shift+Enter', () => {
      const onSend = vi.fn();
      renderTextarea({ value: 'Test message', onSend });

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, {
        key: 'Enter',
        code: 'Enter',
        shiftKey: true,
      });

      expect(onSend).not.toHaveBeenCalled();
    });

    it('calls handleSubmit when onSend is not provided', () => {
      const handleSubmit = vi.fn();
      renderTextarea({ value: 'Test message', handleSubmit });

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      expect(handleSubmit).toHaveBeenCalled();
    });

    it('forwards onKeyDown to outer handler', () => {
      const onKeyDown = vi.fn();
      renderTextarea({ onKeyDown });

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'a' });

      expect(onKeyDown).toHaveBeenCalled();
    });

    it('respects preventDefault from outer onKeyDown', () => {
      const onSend = vi.fn();
      const onKeyDown = (e: React.KeyboardEvent) => e.preventDefault();
      renderTextarea({ onKeyDown, onSend, value: 'test' });

      const textarea = screen.getByRole('textbox');
      fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

      // onSend should NOT be called because outer handler prevented default
      expect(onSend).not.toHaveBeenCalled();
    });
  });

  describe('document badges', () => {
    it('renders file badges for thread documents', () => {
      const threadDocuments = [
        { name: 'report.txt', content: 'test', size: 100, type: 'text/plain' },
        { name: 'notes.md', content: 'test', size: 200, type: 'text/markdown' },
      ];
      renderTextarea({ threadDocuments });

      expect(screen.getByText('report.txt')).toBeInTheDocument();
      expect(screen.getByText('notes.md')).toBeInTheDocument();
    });

    it('does not render document section when no documents', () => {
      const { container } = renderTextarea({ threadDocuments: [] });
      // No FileBadge containers
      expect(container.querySelectorAll('[class*="gap-2"]').length).toBe(0);
    });

    it('calls onThreadDocumentRemove when remove is triggered', async () => {
      const onThreadDocumentRemove = vi.fn();
      const threadDocuments = [
        { name: 'file.txt', content: 'test', size: 100, type: 'text/plain' },
      ];
      const user = userEvent.setup();

      renderTextarea({ threadDocuments, onThreadDocumentRemove });

      // Find the remove button within the file badge
      const fileBadgeArea = screen.getByText('file.txt').closest('div');
      const removeBtn = fileBadgeArea?.querySelector('button');
      expect(removeBtn).toBeInTheDocument();

      await user.click(removeBtn!);
      expect(onThreadDocumentRemove).toHaveBeenCalledWith(0);
    });

    it('renders loading document placeholders', () => {
      const loadingDocuments = [
        { id: 'loading-1', typeLabel: 'DOC' },
        { id: 'loading-2', typeLabel: 'SHEET' },
      ];
      renderTextarea({ loadingDocuments });

      expect(screen.getByText('DOC')).toBeInTheDocument();
      expect(screen.getByText('SHEET')).toBeInTheDocument();
    });
  });

  describe('error display', () => {
    it('renders error message when error prop is provided', () => {
      renderTextarea({
        error: { type: 'required', message: 'This field is required' },
      });

      expect(screen.getByText('This field is required')).toBeInTheDocument();
    });

    it('renders custom errorMessage over error.message', () => {
      renderTextarea({
        error: { type: 'required', message: 'Default error' },
        errorMessage: 'Custom error message',
      });

      expect(screen.getByText('Custom error message')).toBeInTheDocument();
      expect(screen.queryByText('Default error')).not.toBeInTheDocument();
    });

    it('does not render error section when no error', () => {
      renderTextarea();
      expect(
        screen.queryByText('This field is required'),
      ).not.toBeInTheDocument();
    });
  });

  describe('voice input', () => {
    it('renders microphone button when showVoiceInput is true', () => {
      renderTextarea({ showVoiceInput: true });
      const buttons = screen.getAllByRole('button');
      // Should have at least the voice button
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('hides voice button when showVoiceInput is false', () => {
      renderTextarea({ showVoiceInput: false, showArrowIcon: false });
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });
  });

  describe('file attachment button', () => {
    it('renders file attachment icon when showFileAttachment is true', () => {
      renderTextarea({ showFileAttachment: true });
      // The PlusIcon is rendered as attachment icon
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    });

    it('renders hidden file input for file selection', () => {
      const { container } = renderTextarea({ showFileAttachment: true });
      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeInTheDocument();
      expect(fileInput).toHaveAttribute('accept', '.md,.srt,.txt');
    });
  });

  describe('drag and drop', () => {
    it('shows drop overlay on drag enter when file attachment is enabled', () => {
      renderTextarea({ showFileAttachment: true, onFilesDrop: vi.fn() });

      const container = screen
        .getByRole('textbox')
        .closest('[class*="rounded-xl"]')!;

      fireEvent.dragEnter(container, {
        dataTransfer: { files: [] },
      });

      expect(screen.getByText('Drop files here')).toBeInTheDocument();
    });

    it('does not show drop overlay when disabled', () => {
      renderTextarea({
        showFileAttachment: true,
        disabled: true,
        onFilesDrop: vi.fn(),
      });

      const container = screen
        .getByRole('textbox')
        .closest('[class*="rounded-xl"]')!;

      fireEvent.dragEnter(container, {
        dataTransfer: { files: [] },
      });

      expect(screen.queryByText('Drop files here')).not.toBeInTheDocument();
    });

    it('calls onFilesDrop when files are dropped', () => {
      const onFilesDrop = vi.fn();
      renderTextarea({ showFileAttachment: true, onFilesDrop });

      const container = screen
        .getByRole('textbox')
        .closest('[class*="rounded-xl"]')!;

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });

      fireEvent.drop(container, {
        dataTransfer: { files: [file] },
      });

      expect(onFilesDrop).toHaveBeenCalledWith([file]);
    });

    it('does not call onFilesDrop when showFileAttachment is false', () => {
      const onFilesDrop = vi.fn();
      renderTextarea({ showFileAttachment: false, onFilesDrop });

      const container = screen
        .getByRole('textbox')
        .closest('[class*="rounded-xl"]')!;

      const file = new File(['content'], 'test.txt', { type: 'text/plain' });

      fireEvent.drop(container, {
        dataTransfer: { files: [file] },
      });

      expect(onFilesDrop).not.toHaveBeenCalled();
    });
  });

  describe('paste interception', () => {
    it('calls onPasteIntercept on paste event', () => {
      const onPasteIntercept = vi.fn();
      renderTextarea({ onPasteIntercept });

      const textarea = screen.getByRole('textbox');
      fireEvent.paste(textarea, {
        clipboardData: {
          getData: () => 'https://docs.google.com/document/d/abc/edit',
        },
      });

      expect(onPasteIntercept).toHaveBeenCalled();
    });
  });

  describe('left addon', () => {
    it('renders left addon content', () => {
      renderTextarea({
        leftAddon: <span data-testid="custom-addon">Addon</span>,
      });

      expect(screen.getByTestId('custom-addon')).toBeInTheDocument();
    });
  });

  describe('model selector slot', () => {
    it('renders model selector when provided', () => {
      renderTextarea({
        modelSelector: <span data-testid="model-selector">GPT-4o</span>,
      });

      expect(screen.getByTestId('model-selector')).toBeInTheDocument();
    });
  });
});
