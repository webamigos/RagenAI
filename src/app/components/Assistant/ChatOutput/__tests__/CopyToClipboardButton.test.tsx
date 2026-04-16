import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { CopyToClipboardButton } from '../CopyToClipboardButton';
import type { MessageDto } from '@/features/messages/contracts/message.types';

const messages = {
  'success-toast': {
    copied: 'Copied',
    'copy-text': 'Copy text',
    'copy-markdown': 'Copy Markdown',
  },
};

const mockMessage: Partial<MessageDto> = {
  id: 'msg-1',
  content: 'Hello **world**',
};

beforeAll(() => {
  // jsdom doesn't implement ClipboardItem — provide a minimal stub
  (global as unknown as Record<string, unknown>).ClipboardItem = class {
    constructor(public data: Record<string, Blob>) {}
  };
});

beforeEach(() => {
  Object.assign(navigator, {
    clipboard: {
      writeText: vi.fn().mockResolvedValue(undefined),
      write: vi.fn().mockResolvedValue(undefined),
    },
  });
});

function renderButton() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <CopyToClipboardButton
        message={mockMessage as MessageDto}
        htmlContent="<p>Hello <strong>world</strong></p>"
      />
    </NextIntlClientProvider>,
  );
}

describe('CopyToClipboardButton', () => {
  it('renders a single trigger button', () => {
    renderButton();
    expect(screen.getByTestId('copy-trigger-btn')).toBeInTheDocument();
  });

  it('clicking trigger opens dropdown with two items', async () => {
    renderButton();
    await userEvent.click(screen.getByTestId('copy-trigger-btn'));
    expect(screen.getByTestId('copy-text-item')).toBeInTheDocument();
    expect(screen.getByTestId('copy-markdown-item')).toBeInTheDocument();
  });

  it('clicking "Copy text" calls clipboard.write', async () => {
    renderButton();
    await userEvent.click(screen.getByTestId('copy-trigger-btn'));
    await userEvent.click(screen.getByTestId('copy-text-item'));
    expect(navigator.clipboard.write).toHaveBeenCalled();
  });

  it('clicking "Copy Markdown" calls clipboard.writeText', async () => {
    renderButton();
    await userEvent.click(screen.getByTestId('copy-trigger-btn'));
    await userEvent.click(screen.getByTestId('copy-markdown-item'));
    expect(navigator.clipboard.writeText).toHaveBeenCalled();
  });
});
