import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

const messages = {
  'support-page': {
    'send-success': 'Request sent',
    'send-error': 'Error sending',
    errors: {
      'title-min': 'Title too short',
      'message-min': 'Message too short',
      'description-min': 'Description too short',
      'steps-min': 'Steps too short',
      'file-size': 'File too large',
    },
    wizard: {
      'category-title': 'How can we help?',
      back: 'Back',
      submit: 'Send',
      submitting: 'Sending...',
      'new-ticket': 'New request',
      'success-title': 'Request sent',
      'success-message': 'Copy sent to email.',
      close: 'Close',
      categories: {
        bug: { label: 'Bug', description: 'Technical problem' },
        question: { label: 'Question', description: 'I have a question' },
        suggestion: { label: 'Suggestion', description: 'I have an idea' },
      },
      bug: {
        'title-label': 'Title',
        'description-label': 'Description',
        'steps-label': 'Steps',
        'screenshot-label': 'Screenshot',
      },
      question: {
        'title-label': 'Subject',
        'message-label': 'Message',
      },
      suggestion: {
        'title-label': 'Title',
        'description-label': 'Description',
      },
    },
    modal: { 'open-button-label': 'Open support' },
  },
};

vi.mock('@/app/lib/services/api', () => ({
  sendSupportRequest: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({
    successToast: vi.fn(),
    errorToast: vi.fn(),
  }),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import { SupportWizard } from '../index';

const renderWizard = (
  context: 'page' | 'modal' = 'page',
  onClose?: () => void,
) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SupportWizard context={context} onClose={onClose} />
    </NextIntlClientProvider>,
  );

describe('SupportWizard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('pokazuje CategoryStep na starcie', () => {
    renderWizard();
    expect(screen.getByText('How can we help?')).toBeInTheDocument();
    expect(screen.getByText('Bug')).toBeInTheDocument();
    expect(screen.getByText('Question')).toBeInTheDocument();
    expect(screen.getByText('Suggestion')).toBeInTheDocument();
  });

  it('przechodzi do FormStep po wyborze kategorii Bug', () => {
    renderWizard();
    fireEvent.click(screen.getByText('Bug'));
    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('Steps')).toBeInTheDocument();
  });

  it('przechodzi do FormStep po wyborze kategorii Question', () => {
    renderWizard();
    fireEvent.click(screen.getByText('Question'));
    expect(screen.getByText('Subject')).toBeInTheDocument();
    expect(screen.getByText('Message')).toBeInTheDocument();
  });

  it('wraca do CategoryStep po kliknięciu Back', () => {
    renderWizard();
    fireEvent.click(screen.getByText('Question'));
    fireEvent.click(screen.getByText('Back'));
    expect(screen.getByText('How can we help?')).toBeInTheDocument();
  });

  it('w kontekście modal pokazuje przycisk Close w SuccessStep', async () => {
    const onClose = vi.fn();
    const { sendSupportRequest } = await import('@/app/lib/services/api');
    (sendSupportRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
    });

    renderWizard('modal', onClose);
    fireEvent.click(screen.getByText('Question'));

    fireEvent.change(screen.getByLabelText(/Subject/i), {
      target: { value: 'Pytanie o funkcje' },
    });
    fireEvent.change(screen.getByLabelText(/Message/i), {
      target: { value: 'Jak skonfigurować asystenta w projekcie?' },
    });

    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Request sent')).toBeInTheDocument();
    });

    expect(screen.getByText('Close')).toBeInTheDocument();
  });

  it('w kontekście page NIE pokazuje przycisku Close w SuccessStep', async () => {
    const { sendSupportRequest } = await import('@/app/lib/services/api');
    (sendSupportRequest as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      success: true,
    });

    renderWizard('page');
    fireEvent.click(screen.getByText('Question'));

    fireEvent.change(screen.getByLabelText(/Subject/i), {
      target: { value: 'Pytanie o funkcje' },
    });
    fireEvent.change(screen.getByLabelText(/Message/i), {
      target: { value: 'Jak skonfigurować asystenta w projekcie?' },
    });

    fireEvent.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(screen.getByText('Request sent')).toBeInTheDocument();
    });

    expect(screen.queryByText('Close')).not.toBeInTheDocument();
  });
});
